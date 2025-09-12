#!/bin/bash
rm -rf node_modules package-lock.json
npm i
npm link @sahab/core
echo "✅ Linked local @sahab/core to project."
