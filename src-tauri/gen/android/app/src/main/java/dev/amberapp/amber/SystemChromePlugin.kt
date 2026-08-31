package dev.amberapp.amber

import android.app.Activity
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class SetThemeArgs {
  var theme: String = "FollowSystem"
}

@TauriPlugin
class SystemChromePlugin(private val activity: Activity) : Plugin(activity) {
  @Command
  fun setTheme(invoke: Invoke) {
    val args = invoke.parseArgs(SetThemeArgs::class.java)
    SystemBars.setTheme(activity, args.theme)
    invoke.resolve(JSObject())
  }
}
