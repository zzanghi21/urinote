package kr.urinote.app

import android.app.Activity
import android.content.Intent
import android.webkit.WebView
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

/**
 * Reports which notification opened the app (registered from lib.rs as "reminder-tap").
 * - tap while the app runs: "tap" event with the notification ID
 * - tap that started the app: kept until the frontend calls takePending
 */
@TauriPlugin
class ReminderTapPlugin(private val activity: Activity) : Plugin(activity) {
  private var pending: Int? = null

  override fun load(webView: WebView) {
    super.load(webView)
    activity.intent?.let { take(it) }
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    take(intent)
  }

  private fun take(intent: Intent) {
    // set by tauri-plugin-notification on the notification's tap intent
    val id = intent.getIntExtra("NotificationId", Int.MIN_VALUE)
    if (id == Int.MIN_VALUE) return
    if (hasListener("tap")) {
      val data = JSObject()
      data.put("id", id)
      trigger("tap", data)
    } else {
      pending = id
    }
  }

  @Command
  fun takePending(invoke: Invoke) {
    val result = JSObject()
    pending?.let { result.put("id", it) }
    pending = null
    invoke.resolve(result)
  }
}
