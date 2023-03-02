console.log("> Team 5 GEMP extension loaded.");

const envUrl = chrome.runtime.getURL(".env.json");

fetch(envUrl)
  .then(res => res.json())
  .then(out => chrome.storage.local.set(out))
  .then(_out => console.log(`> Loaded environment`))
