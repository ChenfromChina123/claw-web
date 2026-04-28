package com.example.claw_code_application.util

import android.util.Log
import kotlinx.serialization.json.Json

object Logger {
    private const val DEFAULT_TAG = "ClawApp"

    private const val DEBUG_ENABLED = true
    private const val INFO_ENABLED = true
    private const val WARN_ENABLED = true
    private const val ERROR_ENABLED = true

    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        prettyPrint = false
    }

    @JvmStatic
    fun d(tag: String, message: String) {
        if (DEBUG_ENABLED) {
            Log.d(DEFAULT_TAG, "[$tag] $message")
        }
    }

    @JvmStatic
    fun d(tag: String, message: String, throwable: Throwable) {
        if (DEBUG_ENABLED) {
            Log.d(DEFAULT_TAG, "[$tag] $message", throwable)
        }
    }

    @JvmStatic
    fun i(tag: String, message: String) {
        if (INFO_ENABLED) {
            Log.i(DEFAULT_TAG, "[$tag] $message")
        }
    }

    @JvmStatic
    fun w(tag: String, message: String) {
        if (WARN_ENABLED) {
            Log.w(DEFAULT_TAG, "[$tag] $message")
        }
    }

    @JvmStatic
    fun w(tag: String, message: String, throwable: Throwable) {
        if (WARN_ENABLED) {
            Log.w(DEFAULT_TAG, "[$tag] $message", throwable)
        }
    }

    @JvmStatic
    fun e(tag: String, message: String) {
        if (ERROR_ENABLED) {
            Log.e(DEFAULT_TAG, "[$tag] $message")
        }
    }

    @JvmStatic
    fun e(tag: String, message: String, throwable: Throwable) {
        if (ERROR_ENABLED) {
            Log.e(DEFAULT_TAG, "[$tag] $message", throwable)
        }
    }

    @JvmStatic
    fun obj(tag: String, label: String, obj: Any?) {
        if (DEBUG_ENABLED) {
            val jsonStr = when (obj) {
                null -> "null"
                is String -> obj
                else -> try {
                    obj.toString()
                } catch (e: Exception) {
                    "null"
                }
            }
            Log.d(DEFAULT_TAG, "[$tag] $label: $jsonStr")
        }
    }
}