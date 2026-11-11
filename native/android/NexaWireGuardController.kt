// SPDX-License-Identifier: Apache-2.0
// NEXA VPN Android adapter using the official WireGuard tunnel library.

package app.nexa.vpn

import android.content.Context
import android.content.Intent
import android.net.VpnService
import com.wireguard.android.backend.GoBackend
import com.wireguard.android.backend.Tunnel
import com.wireguard.config.Config
import java.io.ByteArrayInputStream

/**
 * Native WireGuard controller. Call authorizationIntent() from the foreground
 * Activity and launch the returned intent; only call connect() after Android
 * grants VPN consent. Never log or persist the config string in plaintext.
 *
 * Invoke connect/disconnect off the UI thread.
 */
class NexaWireGuardController(context: Context) {
    private val appContext = context.applicationContext
    private val backend = GoBackend(appContext)
    private val tunnel = NexaTunnel()

    fun authorizationIntent(): Intent? = VpnService.prepare(appContext)

    fun connect(wgQuickConfig: String): String {
        require(wgQuickConfig.isNotBlank()) { "WireGuard configuration is empty." }
        check(VpnService.prepare(appContext) == null) {
            "VPN permission has not been granted. Launch authorizationIntent() first."
        }

        val config = ByteArrayInputStream(wgQuickConfig.toByteArray(Charsets.UTF_8)).use {
            Config.parse(it)
        }
        val state = backend.setState(tunnel, Tunnel.State.UP, config)
        check(state == Tunnel.State.UP) { "WireGuard backend did not enter UP state." }
        return state.name
    }

    fun disconnect(): String {
        val state = backend.setState(tunnel, Tunnel.State.DOWN, null)
        return state.name
    }

    fun status(): String = backend.getState(tunnel).name

    private class NexaTunnel : Tunnel {
        override fun getName(): String = "nexa-vpn"
        override fun onStateChange(newState: Tunnel.State) {
            // State is read from GoBackend; do not write secrets or configs to logs.
        }
    }
}
