// NEXA VPN gateway agent: processes device revocation jobs only.
// Provisioning jobs remain queued until the server-side IPAM/profile flow is implemented.
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"time"
)

type config struct {
	APIURL string
	GatewayID string
	Token string
	Interface string
}
type jobResponse struct { Job *job `json:"job"` }
type job struct {
	ID string `json:"id"`
	Action string `json:"action"`
	DeviceID string `json:"device_id"`
	PublicKey string `json:"public_key"`
}

func required(name string) string {
	v := strings.TrimSpace(os.Getenv(name))
	if v == "" { log.Fatalf("required environment variable %s is missing", name) }
	return v
}
func loadConfig() config {
	return config{APIURL: strings.TrimRight(required("NEXA_API_URL"), "/"),
		GatewayID: required("NEXA_GATEWAY_ID"), Token: required("NEXA_AGENT_TOKEN"),
		Interface: envOr("NEXA_WG_INTERFACE", "wg0")}
}
func envOr(k, fallback string) string { if v := strings.TrimSpace(os.Getenv(k)); v != "" { return v }; return fallback }

func main() {
	cfg := loadConfig()
	client := &http.Client{Timeout: 15 * time.Second}
	log.Printf("NEXA gateway agent started for gateway %s; interface=%s", cfg.GatewayID, cfg.Interface)
	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()
	for {
		if err := pollOnce(context.Background(), client, cfg); err != nil {
			log.Printf("poll failed: %v", err)
			time.Sleep(5 * time.Second)
		}
		<-ticker.C
	}
}

func pollOnce(ctx context.Context, client *http.Client, cfg config) error {
	payload, _ := json.Marshal(map[string]string{"gatewayId": cfg.GatewayID})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, cfg.APIURL+"/v1/gateway-agent/jobs/claim", bytes.NewReader(payload))
	if err != nil { return err }
	setHeaders(req, cfg)
	res, err := client.Do(req)
	if err != nil { return err }
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK { return fmt.Errorf("claim endpoint returned HTTP %d", res.StatusCode) }
	var result jobResponse
	if err := json.NewDecoder(res.Body).Decode(&result); err != nil { return err }
	if result.Job == nil { return nil }
	ok := false
	switch result.Job.Action {
	case "revoke_peer":
		ok, err = removePeer(cfg.Interface, result.Job.PublicKey)
	case "provision_peer":
		ok, err = provisionPeer(cfg.Interface, result.Job.PublicKey, result.Job.AssignedIPv4)
	default:
		err = errors.New("unsupported job action")
	}
	if err != nil { log.Printf("job %s failed: %v", result.Job.ID, err) }
	return complete(ctx, client, cfg, result.Job.ID, ok)
}

func provisionPeer(iface, publicKey, assignedIPv4 string) (bool, error) {
	if len(publicKey) != 44 || !strings.HasSuffix(publicKey, "=") {
		return false, errors.New("invalid WireGuard public key received")
	}
	if strings.ContainsAny(assignedIPv4, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ/:") || assignedIPv4 == "" {
		return false, errors.New("invalid assigned IPv4 address received")
	}
	if output, err := exec.Command("wg", "set", iface, "peer", publicKey, "allowed-ips", assignedIPv4+"/32").CombinedOutput(); err != nil {
		return false, fmt.Errorf("add WireGuard peer: %w (%s)", err, strings.TrimSpace(string(output)))
	}
	// Persist the running interface so peers survive a gateway restart.
	if output, err := exec.Command("wg-quick", "save", iface).CombinedOutput(); err != nil {
		_, _ = exec.Command("wg", "set", iface, "peer", publicKey, "remove").CombinedOutput()
		return false, fmt.Errorf("persist WireGuard peer: %w (%s)", err, strings.TrimSpace(string(output)))
	}
	return true, nil
}

func removePeer(iface, publicKey string) (bool, error) {
	if len(publicKey) != 44 || !strings.HasSuffix(publicKey, "=") {
		return false, errors.New("invalid WireGuard public key received")
	}
	out, err := exec.Command("wg", "show", iface, "peers").Output()
	if err != nil { return false, fmt.Errorf("inspect WireGuard peers: %w", err) }
	found := false
	for _, peer := range strings.Fields(string(out)) { if peer == publicKey { found = true; break } }
	if !found { return true, nil } // idempotent revoke
	cmd := exec.Command("wg", "set", iface, "peer", publicKey, "remove")
	if output, err := cmd.CombinedOutput(); err != nil {
		return false, fmt.Errorf("remove WireGuard peer: %w (%s)", err, strings.TrimSpace(string(output)))
	}
	if output, err := exec.Command("wg-quick", "save", iface).CombinedOutput(); err != nil {
		return false, fmt.Errorf("persist peer removal: %w (%s)", err, strings.TrimSpace(string(output)))
	}
	return true, nil
}

func complete(ctx context.Context, client *http.Client, cfg config, jobID string, success bool) error {
	payload, _ := json.Marshal(map[string]any{"gatewayId": cfg.GatewayID, "success": success})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, cfg.APIURL+"/v1/gateway-agent/jobs/"+jobID+"/complete", bytes.NewReader(payload))
	if err != nil { return err }
	setHeaders(req, cfg)
	res, err := client.Do(req)
	if err != nil { return err }
	defer res.Body.Close()
	if res.StatusCode != http.StatusNoContent { return fmt.Errorf("completion endpoint returned HTTP %d", res.StatusCode) }
	return nil
}
func setHeaders(req *http.Request, cfg config) {
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Nexa-Agent-Token", cfg.Token)
}
