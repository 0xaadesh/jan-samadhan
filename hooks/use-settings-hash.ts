"use client"

import * as React from "react"

import {
  parseSettingsHash,
  settingsHash,
  type SettingsSectionId,
} from "@/lib/sections"

// history.pushState/replaceState don't fire hashchange, so our own navigations
// announce themselves on this event instead.
const SETTINGS_HASH_EVENT = "settings-hash-change"

function subscribe(onStoreChange: () => void) {
  window.addEventListener("hashchange", onStoreChange)
  window.addEventListener("popstate", onStoreChange)
  window.addEventListener(SETTINGS_HASH_EVENT, onStoreChange)

  return () => {
    window.removeEventListener("hashchange", onStoreChange)
    window.removeEventListener("popstate", onStoreChange)
    window.removeEventListener(SETTINGS_HASH_EVENT, onStoreChange)
  }
}

function navigate(url: string, mode: "push" | "replace") {
  if (mode === "push") {
    window.history.pushState(null, "", url)
  } else {
    window.history.replaceState(null, "", url)
  }
  window.dispatchEvent(new Event(SETTINGS_HASH_EVENT))
}

/**
 * The settings dialog is driven entirely by the URL hash — `#settings/users`,
 * `#settings/groups`, `#settings/profile` — so it survives a refresh and
 * responds to browser back/forward.
 */
export function useSettingsHash() {
  const hash = React.useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => ""
  )

  const section = parseSettingsHash(hash)

  const openSection = React.useCallback((next: SettingsSectionId) => {
    navigate(settingsHash(next), "push")
  }, [])

  const selectSection = React.useCallback((next: SettingsSectionId) => {
    navigate(settingsHash(next), "replace")
  }, [])

  const close = React.useCallback(() => {
    navigate(window.location.pathname + window.location.search, "push")
  }, [])

  return { section, openSection, selectSection, close }
}
