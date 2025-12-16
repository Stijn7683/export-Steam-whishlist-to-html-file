const btn = document.getElementById("export");
const status = document.getElementById("status");

function setStatus(text) {
  status.textContent = text;
  console.log("[popup] " + text);
}

btn.addEventListener("click", async () => {
  setStatus("Looking for active tab...");
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      setStatus("No active tab found.");
      return;
    }

    setStatus("Injecting script into tab...");
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["scrape.js"]
    });

    setStatus("Script injected — check the page for a download prompt.");
  } catch (err) {
    console.error(err);
    setStatus("Error: " + (err && err.message ? err.message : String(err)));
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "log") {
    console.log("[scrape.js]", msg.message);
  }
});
