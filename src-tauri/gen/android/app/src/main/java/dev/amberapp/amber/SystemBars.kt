package dev.amberapp.amber

import android.app.Activity
import android.content.Context
import android.content.res.Configuration
import android.graphics.Color
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.core.view.WindowInsetsControllerCompat

/**
 * Keeps the status/navigation bar icon appearance in sync with the in-app
 * theme. [enableEdgeToEdge] otherwise follows the *system* night mode, so a
 * dark app on a light OS (or the reverse) leaves clock/battery unreadable.
 */
object SystemBars {
  private const val PREFERENCES_NAME = "system_bars"
  private const val THEME_KEY = "theme"
  private const val FOLLOW_SYSTEM = "FollowSystem"

  /**
   * Scrim drawn behind the bars when the platform cannot render contrasting
   * icons itself: light icons need a dark backdrop below API 23 (status bar)
   * and below API 27 (navigation bar), and vice versa. These are the same
   * values androidx uses for its own default [SystemBarStyle] scrims.
   */
  private val LIGHT_SCRIM = Color.argb(0xe6, 0xff, 0xff, 0xff)
  private val DARK_SCRIM = Color.argb(0x80, 0x1b, 0x1b, 0x1b)

  private var theme: String? = null

  fun setTheme(activity: Activity, theme: String) {
    this.theme = theme
    activity
      .getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
      .edit()
      .putString(THEME_KEY, theme)
      .apply()
    apply(activity)
  }

  fun apply(activity: Activity) {
    val componentActivity = activity as? ComponentActivity ?: return
    // On a cold start the frontend has not booted yet, so fall back to the
    // theme last chosen on this device instead of assuming FollowSystem —
    // otherwise a Dark app on a light-mode phone flashes dark-on-dark icons.
    val theme = theme ?: restoreTheme(activity)
    activity.runOnUiThread {
      val barStyle = when (theme) {
        "Dark" -> SystemBarStyle.dark(Color.TRANSPARENT)
        "Light" -> SystemBarStyle.light(Color.TRANSPARENT, DARK_SCRIM)
        else -> SystemBarStyle.auto(LIGHT_SCRIM, DARK_SCRIM)
      }
      componentActivity.enableEdgeToEdge(
        statusBarStyle = barStyle,
        navigationBarStyle = barStyle,
      )

      val dark = when (theme) {
        "Dark" -> true
        "Light" -> false
        else -> isSystemNightMode(activity)
      }
      WindowInsetsControllerCompat(activity.window, activity.window.decorView).apply {
        isAppearanceLightStatusBars = !dark
        isAppearanceLightNavigationBars = !dark
      }
    }
  }

  private fun restoreTheme(activity: Activity): String {
    val stored =
      activity
        .getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
        .getString(THEME_KEY, FOLLOW_SYSTEM)
        ?: FOLLOW_SYSTEM
    theme = stored
    return stored
  }

  private fun isSystemNightMode(activity: Activity): Boolean {
    val nightMask =
      activity.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK
    return nightMask == Configuration.UI_MODE_NIGHT_YES
  }
}
