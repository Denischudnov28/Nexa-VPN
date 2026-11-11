// SPDX-License-Identifier: MIT
import Foundation
import NetworkExtension
import React

@objc(NexaVpnModule)
final class NexaVpnModule: RCTEventEmitter {
    private var manager: NETunnelProviderManager?
    private var observer: NSObjectProtocol?

    override static func requiresMainQueueSetup() -> Bool { false }
    override func supportedEvents() -> [String]! { ["NexaVpnStatus"] }

    override func startObserving() {
        observer = NotificationCenter.default.addObserver(
            forName: .NEVPNStatusDidChange, object: nil, queue: .main
        ) { [weak self] _ in self?.emitStatus() }
        emitStatus()
    }

    override func stopObserving() {
        if let observer { NotificationCenter.default.removeObserver(observer); self.observer = nil }
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
            tunnel.providerBundleIdentifier = "app.nexa.vpn.network-extension"
            tunnel.serverAddress = "NEXA VPN"
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
        NETunnelProviderManager.loadAllFromPreferences { managers, error in
            if let error { completion(nil, error); return }
            completion(managers?.first ?? NETunnelProviderManager(), nil)
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
