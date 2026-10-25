export const THEME_KEY = "scrim-theme";

// Runs before the page paints (in the root layout), so the saved theme shows without a flash.
// Light until the person picks dark with the switch; their choice is remembered from then on.
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t!=="dark")t="light";document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="light"}})()`;
