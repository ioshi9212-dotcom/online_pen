"use client";

import { useEffect, useRef, useState } from "react";

const PULL_LIMIT = 82;
const MAX_PULL = 118;

function isFormElement(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input, textarea, select, button, a, summary"));
}

export default function PullToRefresh() {
  const startYRef = useRef(0);
  const pullingRef = useRef(false);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    function onTouchStart(event: TouchEvent) {
      if (refreshing) return;
      if (window.scrollY > 2) return;
      if (isFormElement(event.target)) return;

      startYRef.current = event.touches[0]?.clientY || 0;
      pullingRef.current = true;
      setPull(0);
    }

    function onTouchMove(event: TouchEvent) {
      if (!pullingRef.current || refreshing) return;
      if (window.scrollY > 2) {
        pullingRef.current = false;
        setPull(0);
        return;
      }

      const currentY = event.touches[0]?.clientY || 0;
      const distance = currentY - startYRef.current;

      if (distance <= 0) {
        setPull(0);
        return;
      }

      const eased = Math.min(MAX_PULL, Math.round(distance * 0.55));
      setPull(eased);
    }

    function onTouchEnd() {
      if (!pullingRef.current || refreshing) return;
      pullingRef.current = false;

      if (pull >= PULL_LIMIT) {
        setRefreshing(true);
        setPull(MAX_PULL);
        window.location.reload();
        return;
      }

      setPull(0);
    }

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [pull, refreshing]);

  const visible = pull > 12 || refreshing;
  const ready = pull >= PULL_LIMIT;

  return (
    <div
      className={visible ? "pull-refresh is-visible" : "pull-refresh"}
      style={{ transform: `translate(-50%, ${Math.min(pull, MAX_PULL) - 48}px)` }}
      aria-live="polite"
    >
      <span className={refreshing ? "pull-refresh-spinner is-spinning" : "pull-refresh-spinner"}>↻</span>
      <b>{refreshing ? "Обновляю…" : ready ? "Отпустите" : "Потяните вниз"}</b>
    </div>
  );
}
