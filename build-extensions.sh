#!/bin/bash

cd extensions/gemp
echo 'Building Team 5 GEMP extension'
rm ./src/data/Dark.json*
rm ./src/data/Light.json*
wget https://raw.githubusercontent.com/swccgpc/swccg-card-json/main/Dark.json -P ./src/data
wget https://raw.githubusercontent.com/swccgpc/swccg-card-json/main/Light.json -P ./src/data
npm install
npm run build
