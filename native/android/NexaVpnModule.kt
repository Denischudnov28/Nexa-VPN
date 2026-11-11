// SPDX-License-Identifier: Apache-2.0
package app.nexa.vpn

import android.app.Activity
import android.content.Intent
import android.net.VpnService
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.uimanager.ViewManager
import java.util.concurrent.Executors

/** Bridge around the official WireGuard GoBackend controller. */
class NexaVpnModule(private val context: ReactApplicationContext) :
    ReactContextBaseJavaModule(context), ActivityEventListener {
    companion object { private const val REQUEST_VPN_PERMISSION = 7319 }

    private val executor = Executors.newSingleThreadExecutor()
    private val controller = NexaWireGuardController(context)
    private var permissionPromise: Promise? = null

    init { context.addActivityEventListener(this) }
    override fun getName() = "NexaVpnModule"

    @ReactMethod
    fun prepare(promise: Promise) {
        val intent = controller.authorizationIntent()
        if (intent == null) { promise.resolve(true); return }
        val activity = reactApplicationContext.currentActivity
        if (activity == null) { promise.reject("E_NO_ACTIVITY", "Open the app before requesting VPN permission."); return }
        if (permissionPromise != null) { promise.reject("E_PERMISSION_PENDING", "VPN permission request is already pending."); return }
        permissionPromise = promise
        try { activity.startActivityForResult(intent, REQUEST_VPN_PERMISSION) }
        catch (error: Exception) {
            permissionPromise = null
            promise.reject("E_PERMISSION_REQUEST", "Could not open Android VPN permission dialog.", error)
        }
    }

    @ReactMethod
    fun connect(config: String, promise: Promise) {
        if (config.isBlank()) { promise.reject("E_EMPTY_CONFIG", "WireGuard configuration is empty."); return }
        if (VpnService.prepare(reactApplicationContext) != null) {
            promise.reject("E_PERMISSION_REQUIRED", "Call prepare() and grant system VPN permission first."); return
        }
        executor.execute {
            try {
                val state = normalizeState(controller.connect(config))
                emitStatus(state)
                promise.resolve(state)
            } catch (error: Exception) {
                emitStatus("error")
                promise.reject("E_CONNECT", "WireGuard tunnel could not start.", error)
            }
        }
    }

    @ReactMethod
    fun disconnect(promise: Promise) {
        executor.execute {
            try {
                val state = normalizeState(controller.disconnect())
                emitStatus(state)
                promise.resolve(state)
            } catch (error: Exception) { promise.reject("E_DISCONNECT", "Could not stop WireGuard tunnel.", error) }
        }
    }

    @ReactMethod
    fun getStatus(promise: Promise) {
        executor.execute {
            try { promise.resolve(normalizeState(controller.status())) }
            catch (error: Exception) { promise.reject("E_STATUS", "Could not read tunnel state.", error) }
        }
    }

    private fun normalizeState(value: String): String = when (value.uppercase()) {
        "UP" -> "connected"
        "DOWN" -> "disconnected"
        else -> value.lowercase()
    }

    private fun emitStatus(value: String) {
        if (reactApplicationContext.hasActiveCatalystInstance()) {
            reactApplicationContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("NexaVpnStatus", value)
        }
    }

    @ReactMethod fun addListener(eventName: String) = Unit
    @ReactMethod fun removeListeners(count: Int) = Unit

    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != REQUEST_VPN_PERMISSION) return
        val promise = permissionPromise ?: return
        permissionPromise = null
        promise.resolve(resultCode == Activity.RESULT_OK && VpnService.prepare(reactApplicationContext) == null)
    }
    override fun onNewIntent(intent: Intent) = Unit

    override fun invalidate() {
        context.removeActivityEventListener(this)
        executor.shutdown()
        permissionPromise?.reject("E_MODULE_DESTROYED", "NEXA VPN module was destroyed.")
        permissionPromise = null
        super.invalidate()
    }
}

class NexaVpnPackage : ReactPackage {
    override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> =
        listOf(NexaVpnModule(context))
    override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> =
        emptyList()
}
