# OS-floor-bot

[![Discord.js](https://img.shields.io/badge/discord.js-v13-blue?style=for-the-badge&logo=discord)](https://www.npmjs.com/package/discord.js)
   [![npm](https://img.shields.io/badge/npm-v8.5.2-red?style=for-the-badge&logo=npm)](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm)
   [![Node.js](https://img.shields.io/badge/Node.js-v16.14.2-brightgreen?style=for-the-badge&logo=node.js)](https://nodejs.org/en/)
   ![WIP](https://img.shields.io/badge/Status-WIP-red?style=for-the-badge)

## 🤖 A Discord bot specialized in monitoring OpenSea NFT Collections.

Discord bot to monitor/query OpenSea collections for floor prices, owner ratio, royalties, etc... Commands allow for setting target floor prices, receiving custom alerts, and accessing important external links to the collection's Twitter, Discord, and website. Support for multi-guild monitoring via mongoDB.

## 🎙️ Commands
* **/add [collection-slug] \[target-price] [Above?]**
  *  Add a collection to the monitor list.
  *  Specify a target floor price (in ETH) and whether to check above or below (True or False)
  *  The "Above?" parameter allows for users to monitor sell targets or buy in targets.
* **/remove [collection-slug]**
  *  Remove a collection from the monitor list.
* **/getlist**
  * View the list of monitored collections as well as the current target prices set for each respective collection.
* **/setalerts [channel-id]**
  * Set the guild's dedicated channel to receive the floor price target alerts. Requires Administrator perms
  * If this is not set then the guild will not receive alerts. Other functions such as /find will still function.
* **/find [collection-slug]**
  * Retrieve a summary of a collection.
  * Returns an embed containing total supply, owner count, royalties (OS royalty included), total volume, and floor price.
  * Plans on including 7 day volume summary, 1 day change, etc


## 🧰 Debugging / Notes
* "collection-slug" refers to the unique identifier associated with the collection. Often found at the end of the collection link: https://opensea.io/collection/azuki => azuki
* This project utilizes mongoDB to support multi-guild functionality. See more here [mongoDB Docs](https://www.mongodb.com/docs/mongodb-vscode/connect/)
* Discord bot is built using discord.js v13 with a focus on slash command utility. See more here [discord.js Guide](https://discordjs.guide/interactions/slash-commands.html#registering-slash-commands)

## 🛠 Dependencies Include:
* [mongoose](https://www.npmjs.com/package/mongoose)
* [@discordjs/builders](https://www.npmjs.com/package/@discordjs/builders)
* [@discordjs/rest](https://www.npmjs.com/package/@discordjs/rest)
* [discord-api-types](https://www.npmjs.com/package/discord-api-types)
* [discord.js](https://www.npmjs.com/package/discord.js)
* [api](https://www.npmjs.com/package/api)


