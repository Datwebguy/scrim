export const THEME_KEY = "scrim-theme";

// Runs before the page paints (in the root layout), so the saved theme shows without a flash.
// With no saved choice, it follows the device.
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="light"}})()`;
