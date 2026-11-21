"use client";

import { useEffect } from "react";
import { initializeApp } from "../js/app.js";

export default function Initialize() {
  useEffect(() => {
    const root = document.getElementById("focura");
    function initialize() {
      const button = root.querySelector("#btn-google-login");
      if (!button || button.dataset.initialized) return;
      button.dataset.initialized = "true";
      void initializeApp();
    }
    initialize();
    // A refresh of the server-rendered shell can replace its HTML without remounting this component.
    const observer = new MutationObserver(initialize);
    observer.observe(root, { childList: true });
    return () => observer.disconnect();
  }, []);
  return null;
}
