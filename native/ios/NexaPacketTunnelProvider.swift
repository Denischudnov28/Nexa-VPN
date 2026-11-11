// SPDX-License-Identifier: MIT
// Copyright © 2026 NEXA VPN contributors.
// WireGuardKit integration follows the upstream WireGuard Apple project (MIT).

import Foundation
import NetworkExtension
import WireGuardKit

final class NexaPacketTunnelProvider: NEPacketTunnelProvider {
    private lazy var adapter = WireGuardAdapter(with: self) { _, _ in
        // Deliberately do not log tunnel configuration or endpoint details.
    }

    override func startTunnel(
        options: [String: NSObject]?,
        completionHandler: @escaping (Error?) -> Void
    ) {
        guard
            let tunnelProtocol = protocolConfiguration as? NETunnelProviderProtocol,
            let wgQuickConfig = tunnelProtocol.providerConfiguration?["WgQuickConfig"] as? String,
            let configuration = try? TunnelConfiguration(
                fromWgQuickConfig: wgQuickConfig,
                called: "NEXA VPN"
            )
        else {
            completionHandler(NexaTunnelError.invalidConfiguration)
            return
        }

        adapter.start(tunnelConfiguration: configuration) { error in
            completionHandler(error)
        }
    }

    override func stopTunnel(
        with reason: NEProviderStopReason,
        completionHandler: @escaping () -> Void
    ) {
        adapter.stop { _ in completionHandler() }
    }

    override func handleAppMessage(
        _ messageData: Data,
        completionHandler: ((Data?) -> Void)? = nil
    ) {
        guard let completionHandler else { return }
        guard messageData == Data([0]) else {
            completionHandler(nil)
            return
        }
        adapter.getRuntimeConfiguration { runtimeConfiguration in
            completionHandler(runtimeConfiguration?.data(using: .utf8))
        }
    }
}

private enum NexaTunnelError: LocalizedError {
    case invalidConfiguration

    var errorDescription: String? {
        "NEXA VPN configuration is missing or invalid."
    }
}
