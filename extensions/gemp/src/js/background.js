console.log('> background.js loaded');

chrome.runtime.onMessage.addListener((message, callback) => {
  if (message.type === "openOptions") {
    chrome.runtime.openOptionsPage();
  } else if (message.type === "updateDeck") {
    chrome.storage.local.set({
      dsDeck: message.data.dsDeck,
      lsDeck: message.data.lsDeck,
    });
  } else if (message.type === "gameEnded") {
    chrome.storage.local.set({
      dsDeck: "",
      lsDeck: "",
      lastGameId: message.data.airtableId
    });
  }
});
