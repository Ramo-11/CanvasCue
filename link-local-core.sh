#!/bin/bash
echo "running rrm -rf node_modules package-lock.json"
rm -rf node_modules package-lock.json
echo "running npm i"
npm i
echo "running npm link @sahab/core"
npm link @sahab/core
echo "✅ Linked local @sahab/core to project."
