package dev.amberapp.amber

import android.content.res.Configuration
import android.os.Bundle

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    SystemBars.apply(this)
    super.onCreate(savedInstanceState)
  }

  override fun onResume() {
    super.onResume()
    SystemBars.apply(this)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    SystemBars.apply(this)
  }
}
