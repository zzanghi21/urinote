package kr.urinote.app

import android.content.Intent
import android.os.Bundle
import android.view.View
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // Keep the web content clear of the status bar, navigation bar and on-screen keyboard.
    // In edge-to-edge mode the WebView reports env(safe-area-inset-*) as 0 and isn't resized for
    // the keyboard, so the bottom toolbar would sit under the gesture bar or behind the keyboard.
    val content = findViewById<View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val bars =
        insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
      view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      WindowInsetsCompat.CONSUMED
    }
  }

  override fun onNewIntent(intent: Intent) {
    // A notification tap can arrive here while the activity is being recreated (process killed in
    // the background), before the plugins have loaded. Plugins read `intent` when they load, so
    // keep the latest one there or the tap is lost.
    setIntent(intent)
    super.onNewIntent(intent)
  }
}
