"use client";

let lockCount = 0;
let previousOverflow = "";

export function lockBodyScroll() {
    const body = document.body;
    if (lockCount === 0) {
        previousOverflow = body.style.overflow;
        body.style.overflow = "hidden";
        body.dataset.overlayActive = "true";
    }
    lockCount += 1;
}

export function unlockBodyScroll() {
    const body = document.body;
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) {
        body.style.overflow = previousOverflow;
        delete body.dataset.overlayActive;
    }
}
