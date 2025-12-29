const btn = document.getElementById("export");
const statuss = document.getElementById("status");

function setStatus(text) {
  statuss.textContent = text;
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

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["scrape.js"]
    });
  } catch (err) {
    console.error(err);
    setStatus("Error: " + (err && err.message ? err.message : String(err)));
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "log") {
    console.log("[scrape.js]", msg.message);
  }

  if (msg.type === "status") {
    statuss.textContent = msg.text;
    console.log("[popup status]", msg.text);
  }
});

