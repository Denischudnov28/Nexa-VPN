// SPDX-License-Identifier: MIT
import Foundation
import NetworkExtension
import React
import CryptoKit
import Security

@objc(NexaVpnModule)
final class NexaVpnModule: RCTEventEmitter {
    private let providerBundleIdentifier = "app.nexa.vpn.network-extension"
    private var manager: NETunnelProviderManager?
    private var observer: NSObjectProtocol?

    override static func requiresMainQueueSetup() -> Bool { false }
    override func supportedEvents() -> [String]! { ["NexaVpnStatus"] }

    override func startObserving() {
        observer = NotificationCenter.default.addObserver(
            forName: .NEVPNStatusDidChange, object: nil, queue: .main
        ) { [weak self] notification in
            guard let self,
                  let connection = notification.object as? NEVPNConnection,
                  connection === self.manager?.connection else { return }
            self.emitStatus()
        }
        emitStatus()
    }

    override func stopObserving() {
        if let observer { NotificationCenter.default.removeObserver(observer); self.observer = nil }
    }

    @objc func getOrCreateKeyPair(_ resolve: @escaping RCTPromiseResolveBlock,
                                 rejecter reject: @escaping RCTPromiseRejectBlock) {
        do {
            let privateKey: Curve25519.KeyAgreement.PrivateKey
            if let stored = keychainRead() {
                privateKey = try Curve25519.KeyAgreement.PrivateKey(rawRepresentation: stored)
            } else {
                privateKey = Curve25519.KeyAgreement.PrivateKey()
                try keychainWrite(privateKey.rawRepresentation)
            }
            resolve(["privateKey": privateKey.rawRepresentation.base64EncodedString(),
                     "publicKey": privateKey.publicKey.rawRepresentation.base64EncodedString()])
        } catch { reject("E_KEYPAIR", "Could not securely create or load the device key.", error) }
    }

    private func keychainRead() -> Data? {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "app.nexa.vpn", kSecAttrAccount as String: "wireguard-private-key",
            kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess else { return nil }
        return result as? Data
    }

    private func keychainWrite(_ data: Data) throws {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "app.nexa.vpn", kSecAttrAccount as String: "wireguard-private-key"]
        SecItemDelete(query as CFDictionary)
        var attributes = query
        attributes[kSecValueData as String] = data
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(attributes as CFDictionary, nil)
        guard status == errSecSuccess else { throw NSError(domain: NSOSStatusErrorDomain, code: Int(status)) }
    }

    @objc func prepare(_ resolve: @escaping RCTPromiseResolveBlock,
                       rejecter reject: @escaping RCTPromiseRejectBlock) {
        loadManager { [weak self] loaded, error in
            if let error { reject("E_PREPARE", "Could not load VPN preferences.", error); return }
            self?.manager = loaded
            resolve(true)
        }
    }

    @objc func connect(_ config: String,
                       resolver resolve: @escaping RCTPromiseResolveBlock,
                       rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard !config.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            reject("E_EMPTY_CONFIG", "WireGuard configuration is empty.", nil); return
        }
        loadManager { [weak self] loaded, error in
            if let error { reject("E_LOAD", "Could not load VPN preferences.", error); return }
            guard let self, let manager = loaded else {
                reject("E_MANAGER", "VPN manager unavailable.", nil); return
            }
            let tunnel = NETunnelProviderProtocol()
            tunnel.providerBundleIdentifier = self.providerBundleIdentifier
            tunnel.serverAddress = "NEXA VPN"
            // DEVELOPMENT ONLY: providerConfiguration may persist private key material.
            // Replace with reviewed Keychain/App Group provisioning before production.
            tunnel.providerConfiguration = ["WgQuickConfig": config]
            manager.protocolConfiguration = tunnel
            manager.localizedDescription = "NEXA VPN"
            manager.isEnabled = true
            manager.saveToPreferences { saveError in
                if let saveError { reject("E_SAVE", "Could not save VPN profile. Check Network Extension entitlement.", saveError); return }
                manager.loadFromPreferences { reloadError in
                    if let reloadError { reject("E_RELOAD", "Could not reload VPN profile.", reloadError); return }
                    do {
                        try manager.connection.startVPNTunnel()
                        self.manager = manager
                        resolve(self.status(manager.connection.status))
                    } catch { reject("E_START", "iOS could not start Packet Tunnel.", error) }
                }
            }
        }
    }

    @objc func disconnect(_ resolve: @escaping RCTPromiseResolveBlock,
                          rejecter reject: @escaping RCTPromiseRejectBlock) {
        loadManager { [weak self] loaded, error in
            if let error { reject("E_LOAD", "Could not load VPN preferences.", error); return }
            self?.manager = loaded
            loaded?.connection.stopVPNTunnel()
            resolve("disconnecting")
        }
    }

    @objc func getStatus(_ resolve: @escaping RCTPromiseResolveBlock,
                         rejecter reject: @escaping RCTPromiseRejectBlock) {
        loadManager { [weak self] loaded, error in
            if let error { reject("E_STATUS", "Could not read VPN status.", error); return }
            self?.manager = loaded
            resolve(self?.status(loaded?.connection.status ?? .disconnected) ?? "disconnected")
        }
    }

    private func loadManager(_ completion: @escaping (NETunnelProviderManager?, Error?) -> Void) {
        NETunnelProviderManager.loadAllFromPreferences { [providerBundleIdentifier] managers, error in
            if let error { completion(nil, error); return }
            let matching = managers?.first {
                ($0.protocolConfiguration as? NETunnelProviderProtocol)?.providerBundleIdentifier == providerBundleIdentifier
            }
            completion(matching ?? NETunnelProviderManager(), nil)
        }
    }

    private func status(_ value: NEVPNStatus) -> String {
        switch value {
        case .invalid, .disconnected: return "disconnected"
        case .connecting: return "connecting"
        case .connected: return "connected"
        case .reasserting: return "reasserting"
        case .disconnecting: return "disconnecting"
        @unknown default: return "error"
        }
    }

    private func emitStatus() {
        guard let manager else { return }
        sendEvent(withName: "NexaVpnStatus", body: status(manager.connection.status))
    }
    deinit { stopObserving() }
}
