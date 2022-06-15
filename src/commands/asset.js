const Discord = require("discord.js");
const { SlashCommandBuilder } = require("@discordjs/builders");
const { MessageEmbed, MessageActionRow, MessageButton } = require("discord.js");
const guildSchema = require("../schemas/guild-schema");
const botconfig = require("../botconfig.json");
const { getOpenSeaAsset } = require("../utils/get-os-asset");
const { getAsset } = require("../utils/get-asset");
const { parseTraits } = require("../utils/parse-traits");
const sdk = require("api")("@opensea/v1.0#595ks1ol33d7wpk");
const db = require("quick.db");
const ms = require("ms");
const { getLooksRareAsset } = require("../utils/get-looksrare-asset");

/*
    quick.db is used for command spam prevention
    quick.db is not a long term db solution in this context
    mongoDB is used for per guild collection storing long term
    while quick.db is for Discord command related tracking
*/
function pruneQueries(author) {
  let queries = db.get(`${author.id}.assetquery`);
  if (!queries) return;

  for (const [key, val] of Object.entries(queries)) {
    if (Date.now() - val[2] >= 90000) {
      delete queries[key];
    }
  }
  db.set(`${author.id}.assetquery`, queries);
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

module.exports = {
  data: new SlashCommandBuilder()
    .setName("asset")
    .setDescription("Get information of an asset.")
    .addStringOption((option) => option.setName("collection-slug").setDescription("OpenSea Collection slug. Commmonly found in the URL of the collection.").setRequired(true))
    .addStringOption((option) => option.setName("token-id").setDescription("NFT specific token id. Usually in name. Otherwise check txn for ID.").setRequired(true)),
  options: "[collection-slug] [token-id]",
  async execute(interaction, args, client) {
    if (db.get(`${interaction.user.id}.assetstarted`) && Date.now() - db.get(`${interaction.user.id}.assetstarted`) <= 10000) {
      return interaction.reply({
        content: `Please wait ${ms(10000 - (Date.now() - db.get(`${interaction.user.id}.assetstarted`)))} before starting another query!`,
        ephemeral: true,
      });
    } else {
      db.set(`${interaction.user.id}.assetstarted`, Date.now());
      pruneQueries(interaction.user);
    }

    let slug = interaction.options.getString("collection-slug");
    let token_id = interaction.options.getString("token-id");

    var aliasFound = false;

    // Check if alias exists
    try {
      let res = await guildSchema.findOne({ guild_id: interaction.guild.id });
      if (!res) {
        await new guildSchema({
          guild_id: interaction.guild.id,
          guild_name: interaction.guild.name,
          alerts_channel: "",
        }).save();
      }
      res = await guildSchema.findOne({ guild_id: interaction.guild.id });
      if (res.aliases && res.aliases[slug]) {
        slug = res.aliases[slug];
        aliasFound = true;
      }
    } catch (err) {
      console.log("Err fetching aliases for guild.");
    }

    await interaction.reply({ content: "Searching for asset...", embeds: [] });

    sdk["retrieving-a-single-collection"]({ collection_slug: slug }).then(async (res) => {
      let collection_asset = res.collection.primary_asset_contracts[0];
      if (!collection_asset) return reject({ status: 400, reason: "Could not find collection contract. Assets not on Ethereum are currently not supported." });
      const collection_contract = collection_asset.address;

      await getAsset(client, slug, token_id)
        .then(async (res) => {
          try {
            const OSEmoji = client.emojis.cache.get("986139643399512105");
            const LooksEmoji = client.emojis.cache.get("986139630845980713");

            let asset = res.assetObject;
            let image_url = asset.image_url;
            let name = asset.name ? asset.name : `#${token_id}`;

            var owner_user = asset.owner.address.substring(2, 8).toUpperCase();
            if (asset.owner.user) owner_user = asset.owner.user.username ? asset.owner.user.username : owner_user;
            let owner = `[${owner_user}](https://opensea.io/${asset.owner.address})`;

            let allSales = res.sales;

            let num_sales = allSales.length;
            const last_sale = res.last_sale;
            var last_sale_date = last_sale.date;
            var last_sale_formatted = "None";
            if (last_sale != "None") {
              let symbol = last_sale.symbol;
              let usd = last_sale.usd;
              let marketplace = last_sale.name;

              switch (marketplace) {
                case "OpenSea":
                  marketplace = OSEmoji;
                  break;
                case "LooksRare":
                  marketplace = LooksEmoji;
                  break;
                default:
                  marketplace = "";
                  break;
              }

              switch (symbol) {
                case "ETH":
                  symbol = "Ξ";
                  break;

                default:
                  break;
              }

              last_sale_formatted = `${marketplace} ${last_sale.price}${symbol} (${usd})`;
            }

            let listings = res.listings;
            var curr_listings = "N/A";
            if (listings && listings.length > 0) {
              curr_listings = "";

              for (var i = 0; i < listings.length; i++) {
                let symbol = listings[i].symbol;
                let marketplace = listings[i].name;

                switch (marketplace) {
                  case "OpenSea":
                    marketplace = OSEmoji;
                    break;
                  case "LooksRare":
                    marketplace = LooksEmoji;
                    break;
                  default:
                    marketplace = "";
                    break;
                }
                switch (symbol) {
                  case "ETH":
                    symbol = "Ξ";
                    break;

                  default:
                    break;
                }
                let usd = listings[i].usd;
                curr_listings += `${marketplace} ${listings[i].price}${symbol} (${usd}) \n`;
              }
            }

            let bids = res.offers;
            var highest_bid = "None";
            if (bids && bids.length > 0) {
              let symbol = bids[0].symbol;
              let marketplace = bids[0].name;

              switch (marketplace) {
                case "OpenSea":
                  marketplace = OSEmoji;
                  break;
                case "LooksRare":
                  marketplace = LooksEmoji;
                  break;
                default:
                  marketplace = "";
                  break;
              }

              switch (symbol) {
                case "ETH":
                  symbol = "Ξ";
                  break;

                default:
                  break;
              }
              let usd = currency.format(bids[0].usd);
              let price = bids[0].price;
              highest_bid = `${marketplace} ${price}${symbol} (${usd})`;
            }

            let sales = res.sales;
            var highest_sale = "None";
            if (sales && sales.length > 0) {
              let symbol = sales[0].symbol;
              let marketplace = sales[0].name;

              switch (marketplace) {
                case "OpenSea":
                  marketplace = OSEmoji;
                  break;
                case "LooksRare":
                  marketplace = LooksEmoji;
                  break;
                default:
                  marketplace = "";
                  break;
              }
              switch (symbol) {
                case "ETH":
                  symbol = "Ξ";
                  break;

                default:
                  break;
              }
              let usd = sales[0].usd;
              let price = sales[0].price;
              highest_sale = `${marketplace} ${price}${symbol} (${usd})`;
            }

            let traits = Object.keys(asset.traits).length > 0 ? asset.traits : "Unrevealed";
            let OS_link = asset.permalink;
            let collection = asset.asset_contract.name;
            let collection_img = asset.asset_contract.image_url;
            var traitDesc = await parseTraits(client, traits).catch((err) => console.log(err));

            const row = new MessageActionRow().addComponents(new MessageButton().setCustomId("asset_traits").setLabel("Show Traits").setStyle("SUCCESS"));

            let embed = new Discord.MessageEmbed()
              .setTitle(`${name} | ${collection}`)
              .setURL(OS_link)
              .setImage(image_url)
              .addField(`Owned By`, owner)
              .addField(`Listed For`, curr_listings)
              .setThumbnail(collection_img)
              .setFooter({
                text: `Slug: ${slug} • Token: ${token_id} • Total Sales: ${num_sales}`,
              })
              .setColor(44774);

            if (highest_bid != "None") {
              embed.addField(`Highest Bid`, highest_bid);
            }

            embed.addField(`Highest Sale`, highest_sale).addField(`Last Sale`, last_sale_formatted);

            let embedTraits = new Discord.MessageEmbed()
              .setTitle(`${name} | ${collection}`)
              .setURL(OS_link)
              .setDescription(traitDesc)
              .setThumbnail(image_url)
              .setFooter({ text: `Slug: ${slug} • Token: ${token_id}` })
              .setColor(44774);

            await interaction.editReply({
              content: " ­",
              embeds: [embed],
              components: [row],
            });

            let currQueries = db.get(`${interaction.user.id}.assetquery`) != null ? db.get(`${interaction.user.id}.assetquery`) : {};
            currQueries[interaction.id] = [embed, embedTraits, Date.now()];
            db.set(`${interaction.user.id}.assetquery`, currQueries);

            const message = await interaction.fetchReply();

            const filter = (btn) => {
              return btn.user.id === interaction.user.id && btn.message.id == message.id;
            };

            const collector = interaction.channel.createMessageComponentCollector({
              filter,
              time: 1000 * 90,
            });

            collector.on("collect", async (button) => {
              let queries = db.get(`${interaction.user.id}.assetquery`);
              if (!queries || !queries[interaction.id]) {
                return button.deferUpdate();
              }
              let salesEmbed = queries[interaction.id][0];
              let traitsEmbed = queries[interaction.id][1];

              if (button.customId == "asset_traits") {
                const row = new MessageActionRow().addComponents(new MessageButton().setCustomId("asset_sales").setLabel("Show Sales").setStyle("SUCCESS"));
                await interaction.editReply({
                  embeds: [traitsEmbed],
                  components: [row],
                });
              } else if (button.customId == "asset_sales") {
                const row = new MessageActionRow().addComponents(new MessageButton().setCustomId("asset_traits").setLabel("Show Traits").setStyle("SUCCESS"));
                await interaction.editReply({
                  embeds: [salesEmbed],
                  components: [row],
                });
              }
              button.deferUpdate();
            });
          } catch (err) {
            console.log(err);
            return interaction.editReply({
              content: `Error parsing asset. Please try again.`,
              ephemeral: true,
            });
          }
        })
        .catch((err) => {
          console.log(err);
        });

      // Get OS Asset and start building embed
      getOpenSeaAsset(client, collection_contract, token_id)
        .then(async (res) => {})
        .catch((reject) => {
          console.log(reject);
          return interaction.editReply({
            content: `Error: ${reject.reason}`,
            ephemeral: true,
          });
        });
    });
  },
};
