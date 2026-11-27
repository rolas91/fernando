package com.drtrafficcontrol.mobile.update

import android.app.Activity
import android.content.Intent
import android.os.Handler
import android.os.Looper
import java.util.concurrent.atomic.AtomicBoolean
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.uimanager.ViewManager
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.appupdate.AppUpdateOptions
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.InstallStatus
import com.google.android.play.core.install.model.UpdateAvailability
import com.drtrafficcontrol.mobile.BuildConfig

class PlayUpdatePackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(PlayUpdateModule(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}

class PlayUpdateModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val manager = AppUpdateManagerFactory.create(context)
  private val preferences = context.getSharedPreferences("play_updates", 0)
  private val handler = Handler(Looper.getMainLooper())
  private var pending: Promise? = null
  private val requestCode = 7391
  private val listener = object : BaseActivityEventListener() {
    override fun onActivityResult(activity: Activity, request: Int, result: Int, data: Intent?) {
      if (request != requestCode) return
      val promise = pending
      pending = null
      if (result == Activity.RESULT_OK) promise?.resolve(null)
      else promise?.reject("UPDATE_CANCELLED", "The update was canceled. Update the app to continue.")
    }
  }

  init { context.addActivityEventListener(listener) }
  override fun getName() = "PlayUpdate"
  private fun required(): Boolean = preferences.getInt("requiredVersion", 0) > BuildConfig.VERSION_CODE

  @ReactMethod fun check(promise: Promise) {
    val settled = AtomicBoolean(false)
    fun unavailable() {
      if (!settled.compareAndSet(false, true)) return
      promise.resolve(Arguments.createMap().apply {
        putBoolean("required", required())
        putBoolean("available", false)
        putBoolean("downloaded", false)
        putBoolean("downloading", false)
        putString("version", BuildConfig.VERSION_NAME)
        putInt("versionCode", BuildConfig.VERSION_CODE)
        putString("error", "Could not check Google Play. Check your connection and try again.")
      })
    }
    val timeout = Runnable { unavailable() }
    handler.postDelayed(timeout, 15000)
    manager.appUpdateInfo.addOnSuccessListener { info ->
      val available = info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE ||
        info.updateAvailability() == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS
      handler.removeCallbacks(timeout)
      if (!settled.compareAndSet(false, true)) return@addOnSuccessListener
      if (available && info.availableVersionCode() > preferences.getInt("requiredVersion", 0)) {
        preferences.edit().putInt("requiredVersion", info.availableVersionCode()).commit()
      }
      promise.resolve(Arguments.createMap().apply {
        putBoolean("required", required())
        putBoolean("available", available)
        putBoolean("downloaded", info.installStatus() == InstallStatus.DOWNLOADED)
        putBoolean("downloading", info.installStatus() == InstallStatus.DOWNLOADING || info.installStatus() == InstallStatus.PENDING || info.installStatus() == InstallStatus.INSTALLING)
        putString("version", BuildConfig.VERSION_NAME)
        putInt("versionCode", BuildConfig.VERSION_CODE)
      })
    }.addOnFailureListener {
      // Retain a previously detected mandatory update even while offline or after relaunch.
      handler.removeCallbacks(timeout)
      unavailable()
    }
  }

  @ReactMethod fun install(promise: Promise) {
    context.runOnUiQueueThread {
      if (pending != null) { promise.reject("UPDATE_BUSY", "The update is already open."); return@runOnUiQueueThread }
      pending = promise
      fun finish(code: String? = null, message: String? = null, error: Exception? = null) {
        if (pending !== promise) return
        pending = null
        if (code == null) promise.resolve(null)
        else promise.reject(code, message, error)
      }
      val timeout = Runnable { finish("UPDATE_CHECK", "Could not check Google Play. Try again.") }
      handler.postDelayed(timeout, 15000)
      manager.appUpdateInfo.addOnSuccessListener { info ->
        handler.removeCallbacks(timeout)
        if (pending !== promise) return@addOnSuccessListener
        if (info.installStatus() == InstallStatus.DOWNLOADED) {
          manager.completeUpdate().addOnSuccessListener { finish() }
            .addOnFailureListener { finish("UPDATE_INSTALL", "Could not install the update. Try again.", it) }
          return@addOnSuccessListener
        }
        val activity = context.currentActivity
        if (activity == null) { finish("UPDATE_ACTIVITY", "Open the app to update."); return@addOnSuccessListener }
        val type = if (info.updateAvailability() == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS) AppUpdateType.IMMEDIATE
          else if (info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE)) AppUpdateType.FLEXIBLE else AppUpdateType.IMMEDIATE
        if (!info.isUpdateTypeAllowed(type)) {
          finish("UPDATE_UNAVAILABLE", "Google Play cannot update the app right now. Open Google Play or try again.")
          return@addOnSuccessListener
        }
        try {
          if (!manager.startUpdateFlowForResult(info, activity, AppUpdateOptions.newBuilder(type).build(), requestCode)) {
            finish("UPDATE_START", "Could not start the update.")
          }
        } catch (error: Exception) {
          finish("UPDATE_START", "Could not start the update.", error)
        }
      }.addOnFailureListener {
        handler.removeCallbacks(timeout)
        finish("UPDATE_CHECK", "Could not check Google Play. Try again.", it)
      }
    }
  }

  override fun invalidate() {
    context.removeActivityEventListener(listener)
    pending?.reject("UPDATE_CLOSED", "The update was closed.")
    pending = null
    super.invalidate()
  }
}
