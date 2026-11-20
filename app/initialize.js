"use client";

import { useEffect } from "react";
import { initializeApp } from "../js/app.js";

export default function Initialize() {
  useEffect(() => {
    const root = document.getElementById("focura");
    if (root.dataset.initialized) return;
    root.dataset.initialized = "true";
    initializeApp();
  }, []);
  return null;
}
