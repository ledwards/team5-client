var Airtable = require("airtable");

var choiceObserverAttached = false;
var logObserverAttached = false;
var lastLogLine = null;
var cards = [];
var loggedGames = [];
var existingGame;
var base;

var darkUrl = chrome.runtime.getURL("Dark.json");
var lightUrl = chrome.runtime.getURL("Light.json");

chrome.storage.local.set({
  dsDeck: null,
  lsDeck: null,
});

chrome.storage.local.get(["AIRTABLE_API_KEY", "AIRTABLE_BASE_ID"], function(items) {
  if (items["AIRTABLE_API_KEY"] && items["AIRTABLE_BASE_ID"]
    && items["AIRTABLE_API_KEY"] != ""
    && items["AIRTABLE_BASE_ID"] != "") {
    Airtable.configure({
      endpointUrl: "https://api.airtable.com",
      apiKey: items["AIRTABLE_API_KEY"]
    });
    base = Airtable.base(items["AIRTABLE_BASE_ID"]);
    loadGameRecords(gameData);
    console.log("> Airtable configured")
  } else {
    console.log("> Need to configure Airtable");
    chrome.runtime.sendMessage({ type: "openOptions" });
  }
});

fetch(darkUrl)
  .then(res => res.json())
  .then(out => cards = cards.concat(out["cards"]))
  .then(_out => console.log("> Loaded Dark.json"))
  .then(_out => fetch(lightUrl)
    .then(res => res.json())
    .then(out => cards = cards.concat(out["cards"]))
    .then(_out => console.log("> Loaded Light.json"))
  )
  .then(_out => processGameHistory());

function attachLogObserver() {
  logObserver.disconnect();
  logObserver.observe(document.querySelector("#chatBox"), { subtree: true, childList: true });
  logObserverAttached = true;
}

function attachModalObserver() {
  modalObserver.disconnect();
  modalObserver.observe(document.querySelector("body"), { subtree: true, childList: true });
}

function attachChoiceObserver() {
  choiceObserver.disconnect();
  choiceObserver.observe(document.querySelector("#arbitraryChoice").closest(".ui-dialog"), { subtree: true, childList: true });
}

function attachGameFormatObserver() {
  gameFormatObserver.disconnect();
  gameFormatObserver.observe(document.querySelector("#chatBox"), { subtree: true, childList: true });
}

function attachGameStartObserver() {
  gameStartObserver.disconnect();
  gameStartObserver.observe(document.querySelector("#chatBox"), { subtree: true, childList: true });
}

function attachGameEndObserver() {
  gameEndObserver.disconnect();
  gameEndObserver.observe(document.querySelector("#chatBox"), { subtree: true, childList: true });
}

function waitForElement(selector) {
  return new Promise(resolve => {
    if (document.querySelector(selector)) {
      return resolve(document.querySelector(selector));
    }

    const observer = new MutationObserver(mutations => {
      if (document.querySelector(selector)) {
        resolve(document.querySelector(selector));
        observer.disconnect();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  });
}

let modalObserver = new MutationObserver(function(mutations) {
  // Looks for the arbitraryChoice div to be created and attached the choiceListener
  for (let mutation of mutations) {
    if (mutation.type === "childList") {
      if (mutation.addedNodes.length > 0) {
        for (let node of mutation.addedNodes) {
          let parentNode = node.parentNode;
          if (!choiceObserverAttached && parentNode && parentNode.getAttribute("id") == "arbitraryChoice") {
            attachChoiceObserver();
            modalObserver.disconnect();
            choiceObserverAttached = true;
          }
        }
      }
    }
  }
});

let setup = () => {
  initPlayers();
  attachLogObserver();
  attachGameStartObserver();
  attachGameEndObserver();
}

let processLogLine = (node) => {
  var htmlObject = document.createElement("div");
  htmlObject.innerHTML = node.innerHTML;
  lastLogLine = htmlObject.innerText;

  if (lastLogLine.startsWith("Players in the game are")) {
    setup();
  } // Game begins, log resets

  if (lastLogLine == "Reverted to previous game state") {
    attachLogObserver();
    attachGameEndObserver();
  } // Revert has happened, log resets

  let mentionedCardsHTML = htmlObject.querySelectorAll(".cardHint");

  if (mentionedCardsHTML.length > 0) {
    let playerName = lastLogLine.split(" ")[0];
    let verb = lastLogLine.split(" ")[1];
    let player = playerByName(playerName);
    let gempIds = [];

    let matchedGempIds = Array.from(htmlObject.querySelectorAll(".cardHint")).map(i =>
      i.getAttribute("value")
        .replaceAll("*", "")
        .replaceAll("^", "")
    );
    if (matchedGempIds.length > 1 && verb == "deploys" && lastLogLine.includes("simultaneously")) {
      gempIds = [matchedGempIds[0], matchedGempIds[1]];
    } else if (matchedGempIds.length > 0) {
      gempIds = [matchedGempIds[0]];
    }

    for (let gempId of gempIds) {
      let card = cards.find(c => c["gempId"] == gempId);
      if (!card) {
        console.log`ERROR: could not find card for: ${lastLogLine} (${gempId})}`;
        return;
      }
      let isDefShield = card["front"]["type"] == "Defensive Shield";

      if (!isDefShield
        && player
        && ["deploys", "plays", "loses", "draws", "reveals", "takes", "stacks"].includes(verb)
        && !(lastLogLine.includes("loses") && lastLogLine.includes("and stacks it face down"))
        // losing a force to e.g. I Feel the Conflict face-down otherwise erroneously says thee opponent has lost the stacker card
        && !(lastLogLine.includes("targets") && lastLogLine.includes("matching") && lastLogLine.includes("simultaneously"))
        // first time a matching starship or vehicle is targeted to deploy, skip it; the deploy line comes next
      ) {
        addCardToDeck(player, card, verb);
      }
    }
  }
  gameData["log"].push(lastLogLine);
  htmlObject.remove();
}

let processGameHistory = () => {
  console.log("> Processing game history");
  waitForElement("#chatBox .chatMessages .gameMessage").then((firstNode) => {
    let parent = firstNode.parentNode;
    let nodes = parent.querySelectorAll(".gameMessage");

    if (firstNode.innerText.includes("You're starting a game of")) {
      // TODO: Exclude chat messages in the log from this
      console.log("> Started processing at the beginning of the log");
      for (let node of nodes) {
        processLogLine(node);
        checkGameFormat(lastLogLine);
        checkLogForArchetypes(lastLogLine);
      }
    } else { // log starts at middle of the game
      setup();
      console.log(`> Started processing at line: ${lastLogLine}`);
      for (let node of nodes) {
        processLogLine(node);
      }

      let cardNodes = document.querySelectorAll(".card > img");
      console.log(`> Processing ${cardNodes.length} cards already on table`);
      for (let node of cardNodes) {
        if (!node.getAttribute('src').includes("CardBack")) {
          processCardNode(node, "ontable");
        }
      }

      for (let p of gameData["players"]) {
        let obj = Object.keys(p["deck"]).find(e => e.includes("/")); // is an Objective
        p["archetype"] = obj ? obj.split(" / ")[0] : "(No Objective)";
      }

      gameData["format"] = "No Data";

    }
  });
}

let logObserver = new MutationObserver(function(mutations) {
  for (let mutation of mutations) {
    if (mutation.type === "childList") {
      if (mutation.addedNodes.length > 0) {
        for (let node of mutation.addedNodes) {
          processLogLine(node);
        }
      }
    }
  }
});

let processCardNode = (cardNode, verb) => {
  let filename = filenameFromUrl(cardNode.getAttribute("src"))
    .replace("_ai", "")
    .replace("ai.gif", ".gif")
    .replace("ai.png", ".png")
    ;
  let card = cards.find(c => filename == filenameFromUrl(c["front"]["imageUrl"]));

  // handle AIs that come from outside of the set their non-AI version is in (e.g. the Virtual AI Set)
  if (!card && filename.includes("AlternateImage")) {
    // compare only filenames, no path or extensions
    filename = filename.split("/").pop().split(".")[0];
    card = cards.find(c => filename == filenameFromUrl(c["front"]["imageUrl"].split("/").pop().split(".")[0]));
  }

  if (!card) {
    console.log(`ERROR: Card not found with image url: ${filename}`);
    return;
  }

  let side = cardNode.getAttribute("src").split("/cards/").pop().split("/")[0].split("-").pop();
  let player = playerBySide(side);
  let isDefShield = card["front"]["type"] == "Defensive Shield";

  if (!isDefShield) {
    addCardToDeck(player, card, verb);
  }
}

let choiceObserver = new MutationObserver(function(mutations) {
  for (let mutation of mutations) {
    if (mutation.type === "childList") {
      if (mutation.addedNodes.length > 0) {
        for (let node of mutation.addedNodes) {
          if (!node.querySelector) {
            // I have no idea how this happens, but need to skip this element when it does
            return;
          }

          for (let cardNode of node.querySelectorAll(".card > img")) {
            processCardNode(cardNode, "verifies");
          }
        }
      }
    }
  }
});

let playerByName = (name) => gameData["players"].find(p => p["name"] == name);
let playerBySide = (side) => gameData["players"].find(p => p["side"] == side);

let filenameFromUrl = (url) =>
  url.split("/cards/").pop()
    .replace("/large/", "/")
    .replace("/hires/", "/")
    .replace("ResetDS", "Virtual0")
    .split(".")[0];

let addCardToDeck = (player, card, verb) => {
  let cardTitle = card["front"]["title"].replace(" (AI)", "").replaceAll("•", "").replaceAll("<>", "");
  let cardType = card["front"]["type"];

  if (cards
    .filter(c => c["front"]["type"] != "Defensive Shield")
    // Note: this will not match an AI to a non-AI, as they don't count as duplicates for this purpose
    .filter(c => c["front"]["title"].replaceAll("•", "").replaceAll("<>", "") == cardTitle && c["side"] == player["side"]).length > 1) {
    let set = card["front"]["imageUrl"].split("/cards/").pop().split("-")[0]
      .replace("CloudCity", "CC")
      .replace("Virtual", "V")
      .replace("SpecialEdition", "SE");
    cardTitle += ` (${set})`;
  }

  player["deck"][cardTitle] = player["deck"][cardTitle] || {};
  player["deck"][cardTitle][verb] = player["deck"][cardTitle][verb] ? player["deck"][cardTitle][verb] + 1 : 1;
  player["deck"][cardTitle]["type"] = cardType;

  chrome.runtime.sendMessage({
    type: "updateDeck",
    data: {
      dsDeck: playerBySide("Dark")["deck"],
      lsDeck: playerBySide("Light")["deck"]
    }
  });

  console.log(`${player["name"]} ${verb} ${cardTitle}`);
};

let loadGameRecords = async (data) => {
  base("Games")
    .select().eachPage(function page(records, fetchNextPage) {
      loggedGames = loggedGames.concat(records);
      fetchNextPage();
    }, function done(err) {
      if (err) {
        console.error(err); return;
      } else {
        existingGame = loggedGames.find(g =>
          (data["gameId"] && g["fields"]["Game ID"] == data["gameId"]) ||
          (data["replayUrl"] && g["fields"]["DS Replay URL"] == data["replayUrl"]) ||
          (data["replayUrl"] && g["fields"]["LS Replay URL"] == data["replayUrl"]) ||
          (data["log"].includes(g["fields"]["Log"]))
        );
        console.log(`> Connected to Airtable and found ${loggedGames.length} past game records`);

        if (existingGame) {
          console.log(`> Found existing game logged with ID: ${existingGame["id"]}`);
        }
      }
    });
};

let toDeckString = (deck) => {
  let groupedCards = {};

  for (let type of ["Objective", "Location", "Character", "Vehicle", "Starship", "Effect", "Interrupt",
    "Weapon", "Device", "Creature", "Epic Event", "Admiral's Order", "Podracer", "Jedi Test"]) {
    let cardsWithType = Object.entries(deck)
      .filter(kv => kv[1]["type"] == type);

    if (cardsWithType.length > 0) {
      groupedCards[type] = cardsWithType;
    }
  }

  let deckString = "";
  for (let group of Object.keys(groupedCards)) {
    deckString += `${group.toUpperCase()}S (${groupedCards[group].length})\n`;
    for (let card of groupedCards[group]) {
      let title = card[0];
      let occurences = Object.entries(card[1]).filter(e => e[0] != "type");
      deckString += `${title} (${occurences.map(o => `${o[0]}: ${o[1]}`).join(", ")})\n`
    }
    deckString += "\n";
  }
  return deckString;
}

let reportGameData = async (data) => {
  console.log("> Reporting game data");

  let dsPlayer = playerBySide("Dark");
  let lsPlayer = playerBySide("Light");

  let dsDeckString = toDeckString(dsPlayer["deck"]);
  let lsDeckString = toDeckString(lsPlayer["deck"]);

  let record = {
    "fields": {
      "Format": data["format"],
      "DS Player": dsPlayer["name"],
      "LS Player": lsPlayer["name"],
      "DS Archetype": dsPlayer["archetype"],
      "LS Archetype": lsPlayer["archetype"],
      "DS Decklist": dsDeckString,
      "LS Decklist": lsDeckString,
      "Winning Side": data["winningSide"],
      "Winner": data["winner"],
      "Loser": data["loser"],
      "Reason": data["reason"],
      "Game ID": data["gameId"],
      "Log": data["log"].join("\n")
    }
  }

  let povPlayerName = window.location.toString().split("replayId=").pop().split("$")[0];

  if (data["replayUrl"]) {
    replayFieldName = playerBySide("Dark")["name"] == povPlayerName ? "DS Replay URL" : "LS Replay URL";
    record["fields"][replayFieldName] = data["replayUrl"];
  }

  if (existingGame) {
    record["id"] = existingGame["id"];
    base("Games").update(
      // TODO: This should concatenate logs, decklists, and insert/replace other fields
      [record],
      function(err, records) {
        if (err) {
          console.error(err);
          return;
        }
        records.forEach(function(record) {
          console.log(`Updated game in existing Airtable record: ${record.getId()}`);
          chrome.runtime.sendMessage({ type: "gameEnded", data: { airtableId: record.getId() } });
        });
      });
  } else {
    base("Games").create(
      [record],
      function(err, records) {
        if (err) {
          console.error(err);
          return;
        }
        records.forEach(function(record) {
          console.log(`Reported game to Airtable record: ${record.getId()}`);
          chrome.runtime.sendMessage({ type: "gameEnded", data: { airtableId: record.getId() } });
        });
      });
  }
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type == "reportGame") {
    console.log("> Reporting partial game data");
    gameData["winningSide"] = "TBD";
    gameData["winner"] = "TBD";
    gameData["loser"] = "TBD";
    gameData["reason"] = "TBD";
    reportGameData(gameData);
  }
  Promise.resolve("").then(result => sendResponse(result));
  return true;
});

let checkGameFormat = (line) => {
  if (line.includes("You're starting a game of")) {
    gameData["format"] = line.split("of").pop().trim();
    console.log(`> Set game format to ${gameData["format"]}`);
    gameFormatObserver.disconnect();
  }
}

let gameFormatObserver = new MutationObserver(function(mutations) {
  for (let mutation of mutations) {
    if (mutation.type === "childList") {
      if (mutation.addedNodes.length > 0) {
        for (let node of mutation.addedNodes) {
          var htmlObject = document.createElement("div");
          htmlObject.innerHTML = node.innerHTML;
          lastLogLine = htmlObject.innerText;

          checkGameFormat(lastLogLine);

          htmlObject.remove();
        }
      }
    }
  }
});

let initPlayers = () => {
  if (gameData["players"].length == 0) {
    let playerDivs = document.getElementsByClassName("player");
    for (let div of playerDivs) {
      gameData["players"].push({
        name: div.innerText.split(".").pop().split("\n")[0].trim(),
        side: div.innerHTML.toString().includes("darkHandsize") ? "Dark" : "Light",
        archetype: null,
        result: null,
        deck: {},
      });
    }
    console.log(`> Initialized players ${gameData["players"][0]["name"]} (${gameData["players"][0]["side"]}), ${gameData["players"][1]["name"]} (${gameData["players"][1]["side"]})`);
  }
}

let checkLogForArchetypes = (line) => {
  for (player of gameData["players"]) {
    if (!player["archetype"] || player["archetype"] == "") {
      if (line.includes(`${player["name"]} reveals Objective`)
        || (line.includes(`${player["name"]} deploys`)
          && (line.includes("from Reserve Deck"))
          && (!line.includes("Anger, Fear, Aggression (V)"))
          && (!line.includes("Knowledge And Defense (V)"))
          && (!line.includes("Fear Is My Ally"))
          && (!line.includes("An Unusual Amount of Fear"))
        )) {
        player["archetype"] = line.split("reveals Objective ").pop().split("deploys ").pop().split(" from Reserve Deck")[0].replace("•", "");
        console.log(`> Set ${player["name"]}'s archetype to ${player["archetype"]}`);
      }
    }
  };
}

let gameStartObserver = new MutationObserver(function(mutations) {
  for (let mutation of mutations) {
    if (mutation.type === "childList") {
      if (mutation.addedNodes.length > 0) {
        for (let node of mutation.addedNodes) {
          var htmlObject = document.createElement("div");
          htmlObject.innerHTML = node.innerHTML;
          lastLogLine = htmlObject.innerText;

          if (gameData["players"].length > 1 && gameData["players"][0]["archetype"] && gameData["players"][1]["archetype"]) {
            gameStartObserver.disconnect();
          }
          htmlObject.remove();
        }
      }
    }
  }
});

let gameEndObserver = new MutationObserver(function(mutations) {
  for (let mutation of mutations) {
    if (mutation.type === "childList") {
      if (mutation.addedNodes.length > 0) {
        for (let node of mutation.addedNodes) {
          var htmlObject = document.createElement("div");
          htmlObject.innerHTML = node.innerHTML;
          lastLogLine = htmlObject.innerText;

          if (htmlObject.innerText.includes("lost due to")) {
            gameData["reason"] = htmlObject.innerText.split(":").pop().trim();
            gameData["loser"] = htmlObject.innerText.split(" ")[0];
            gameData["players"].find(p => p["name"] == gameData["loser"])["result"] = "Lost";
          }

          if (htmlObject.innerText.includes("is the winner due to")) {
            gameData["winner"] = htmlObject.innerText.split(" ")[0];
            let winningPlayer = gameData["players"].find(p => p["name"] == gameData["winner"]);
            winningPlayer["result"] = "Won";
            gameData["winningSide"] = winningPlayer["side"];

            reportGameData(gameData);
            gameEndObserver.disconnect();
          }
          htmlObject.remove();
        }
      }
    }
  }
});

var gameData = {
  players: [
    // e.g. {
    //     name: null,
    //     side: null,
    //     archetype: null,
    //     result: null,
    //     deck: [],
    // },
  ],
  format: null,
  winner: null,
  loser: null,
  winningSide: null,
  reason: null,
  replayUrl: window.location.toString().includes("replayId") ?
    window.location.toString()
    : null,
  gameId: window.location.toString().includes("gameId") ?
    window.location.toString().split("gameId=").pop()
    : null,
  log: []
};

attachLogObserver();
attachModalObserver(); // which listens for the right time to attach the choiceObserver
attachGameFormatObserver();

console.log("> Team 5 GEMP extension loaded for game.");
