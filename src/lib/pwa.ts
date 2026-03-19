/**
 * Detecta se o app está rodando como PWA instalado (standalone).
 * Inclui Safari iOS (navigator.standalone) e display-mode: standalone.
 */
export function isPwaStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true; // iOS Safari
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  if ((window as Window & { matchMedia?(q: string): MediaQueryList }).matchMedia?.("(display-mode: fullscreen)").matches) return true;
  return false;
}

export type InstallPlatform = "android" | "ios" | "other";

/**
 * Detecta a plataforma para mostrar instruções de instalação corretas.
 */
export function getInstallPlatform(): InstallPlatform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent.toLowerCase();
  if (/android/.test(ua)) return "android";
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  // iPad no iOS 13+ pode reportar como Mac
  if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) return "ios";
  return "other";
}
