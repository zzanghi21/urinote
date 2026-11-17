package kr.urinote.app

import android.app.Activity
import android.content.Context
import android.net.wifi.WifiManager
import android.os.Build
import android.provider.Settings
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

/**
 * Device services for friend sharing (registered from lib.rs as "device"; called from Rust, not
 * from the webview).
 */
@TauriPlugin
class DevicePlugin(private val activity: Activity) : Plugin(activity) {
  private var multicastLock: WifiManager.MulticastLock? = null

  /** The name the user gave the phone ("Galaxy S24"), else the model name */
  @Command
  fun deviceName(invoke: Invoke) {
    val name =
      Settings.Global.getString(activity.contentResolver, Settings.Global.DEVICE_NAME)
        ?.takeIf { it.isNotBlank() } ?: Build.MODEL
    val result = JSObject()
    result.put("name", name)
    invoke.resolve(result)
  }

  /**
   * Android drops incoming multicast packets unless an app holds a multicast lock, so mDNS would
   * never see other devices. Held until the process ends (sharing runs as long as the app does).
   */
  @Command
  fun holdMulticast(invoke: Invoke) {
    if (multicastLock == null) {
      val wifi = activity.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
      multicastLock =
        wifi.createMulticastLock("urinote-mdns").apply {
          setReferenceCounted(false)
          acquire()
        }
    }
    invoke.resolve()
  }
}
