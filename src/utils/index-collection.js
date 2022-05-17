const Discord = require("discord.js");
const axios = require('axios');
const botconfig = require('../botconfig.json');
const guildSchema = require('../schemas/guild-schema');
const asset = require("../commands/asset");
const sdk = require('api')('@opensea/v1.0#595ks1ol33d7wpk');

/**
 * Function to calculate the rarity scores for a collection.
 * Plans to store in mongoDB for indexed collections to prevent rate limits calling OS API
 */

function delay(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}

exports.indexCollection = async (client, collection_slug) => {

    return new Promise((resolve, reject) => {

        if (client.OS_INDEX_QUEUE.indexOf(collection_slug) != -1) return reject('Collection is already queued for indexing. Please check back in a moment.');

        var allTokensArr = [];
        var allTokens = {};

        sdk['retrieving-a-single-collection']({ collection_slug: collection_slug })
            .then(async (res) => {
                const totalSupply = res.collection.stats.total_supply;

                const c = res.collection;
                let allTraits = res.collection.traits;
                if (!allTraits || allTraits.length == 0) return reject('Could not find traits for given collection. Please try again in a moment.')

                // Calc avg number of traits per category. Used for rarity score normalization
                var sum = 0;
                var categories = {}
                var num_traits_freq = {};
                for (const category in allTraits) {
                    let traits = allTraits[category];
                    sum += Object.keys(traits).length;

                    let category_sum = 0;
                    Object.keys(traits).forEach((t) => {
                        category_sum += traits[t]
                    })
                    categories[category.toLowerCase()] = category_sum;
                }
                const avgPerCat = sum / Object.keys(allTraits).length;

                // Calc trait rarity per category
                var trait_rarity = {};
                for (const category in allTraits) {
                    trait_rarity[category.toLowerCase()] = {};
                    let traits = allTraits[category];
                    let trait_total = (totalSupply != categories[category.toLowerCase()] ? Object.keys(traits).length + 1 : Object.keys(traits).length);
                    Object.keys(traits).forEach((t) => {
                        let freq = traits[t] / totalSupply;
                        let rarity = 1 / freq;
                        let rarity_norm = rarity * (avgPerCat / trait_total);
                        let rarity_avg = (rarity + rarity_norm) / 2;
                        trait_rarity[category.toLowerCase()][t] = { rarity: rarity, rarity_norm: rarity_norm, rarity_avg: rarity_avg };
                    })
                    trait_rarity[category.toLowerCase()]['none'] = { rarity: 0, rarity_norm: 0 }
                    // Include rarity scores for if the NFT does not have the trait category. (4-T or 5-T rares)
                    // If all NFTs have the trait category 'none' will default to 0 for rarity score calc below
                    if (totalSupply != categories[category.toLowerCase()]) {
                        let none_freq = (totalSupply - categories[category.toLowerCase()]) / totalSupply;
                        let none_rarity = 1 / none_freq;
                        let none_rarity_norm = none_rarity * (avgPerCat / trait_total);
                        let none_rarity_avg = (none_rarity + none_rarity_norm) / 2
                        trait_rarity[category.toLowerCase()]['none'] = { rarity: none_rarity, rarity_norm: none_rarity_norm, rarity_avg: none_rarity_avg }
                    } else {
                        trait_rarity[category.toLowerCase()]['none'] = { rarity: 0, rarity_norm: 0, rarity_avg: 0 }
                    }
                }

                // Asset fetching in batches of 50 per call.
                var cursor = '';
                client.OS_INDEX_QUEUE.push(collection_slug);
                while (allTokensArr.length < totalSupply) {
                    let error = false;
                    try {
                        while (client.OS_QUEUE_PRIO > 0 || (client.OS_INDEX_QUEUE.length > 0 && (collection_slug != client.OS_INDEX_QUEUE[0]) && collection_slug != client.OS_INDEX_QUEUE[1])) {
                            await delay(2500);
                        }
                        client.OS_QUEUE++;
                        let assetJSON = await sdk['getting-assets']({
                            collection_slug: collection_slug,
                            limit: '50',
                            include_orders: 'false',
                            cursor: cursor,
                            'X-API-KEY': botconfig.OS_API_KEY
                        }).catch(async (err) => {
                            error = true;
                        })
                        if (error) {
                            client.OS_QUEUE--;
                            console.log("Rate limit... Waiting")
                            await delay(Math.random() * 1000 + 500);
                            continue
                        }
                        client.OS_INDEX_CNT++;
                        // Attempt at Round Robin Scheduling (Modified to support two collections requesting per RR cycle)
                        if (client.OS_INDEX_CNT >= 20) {
                            let slug = client.OS_INDEX_QUEUE.shift();
                            client.OS_INDEX_QUEUE.push(slug);
                            client.OS_INDEX_CNT = 0;
                        }
                        client.OS_QUEUE--;
                        console.log(`${collection_slug} : ${allTokensArr.length}`)

                        assetJSON.assets.forEach(asset => {
                            let { name, token_id, traits } = asset;

                            const asset_traits = traits;
                            var none_categories = Object.keys(categories);

                            // console.log(asset_traits)
                            var rarity_score = 0;
                            var rarity_score_norm = 0;
                            var rarity_score_avg = 0;
                            // Sum up rarity scores based on asset's traits
                            for (var i = 0; i < asset_traits.length; i++) {
                                let t = asset_traits[i];
                                none_categories = none_categories.filter(c => c !== t.trait_type.toLowerCase());
                                rarity_score += trait_rarity[t.trait_type.toLowerCase()][t.value.toLowerCase()].rarity;
                                rarity_score_norm += trait_rarity[t.trait_type.toLowerCase()][t.value.toLowerCase()].rarity_norm;
                                rarity_score_avg += trait_rarity[t.trait_type.toLowerCase()][t.value.toLowerCase()].rarity_avg;
                            }
                            // Account for rarity in not having specific traits
                            for (var j = 0; j < none_categories.length; j++) {
                                rarity_score += trait_rarity[none_categories[j]]['none'].rarity;
                                rarity_score_norm += trait_rarity[none_categories[j]]['none'].rarity_norm;
                                rarity_score_avg += trait_rarity[none_categories[j]]['none'].rarity_avg;
                            }
                            if (!num_traits_freq[asset_traits.length]) num_traits_freq[asset_traits.length] = 0
                            num_traits_freq[asset_traits.length] += 1;

                            let asset_rarity = {
                                token_id: token_id,
                                trait_count: asset_traits.length,
                                rarity_score: rarity_score,
                                rarity_score_norm: rarity_score_norm,
                                rarity_score_avg: rarity_score_avg
                            }
                            allTokensArr.push(asset_rarity);
                            allTokens[token_id] = asset_rarity;
                            // console.log(`Token ${token_id} : ${rarity_score}, ${rarity_score_norm}, ${rarity_score_avg} `);
                        });
                        cursor = assetJSON.next;
                    } catch (err) {
                        console.log(err);
                        await delay(1000);
                    }

                }

                // console.log(allTokens)
                var trait_count_rarities = {};
                var trait_count_sum = 0;
                Object.keys(num_traits_freq).forEach((t) => {
                    trait_count_sum += num_traits_freq[t]
                })
                const trait_count_avg = trait_count_sum / Object.keys(num_traits_freq).length;

                const trait_counts = Object.keys(num_traits_freq)
                for (var i = 0; i < trait_counts.length; i++) {
                    let count_freq = num_traits_freq[trait_counts[i]] / totalSupply;
                    let count_rarity = 1 / count_freq;
                    trait_count_rarities[trait_counts[i]] = count_rarity;
                }
                console.log(trait_count_rarities)
                for (var j = 0; j < allTokensArr.length; j++) {
                    let trait_score = trait_count_rarities[allTokensArr[j].trait_count];
                    allTokensArr[j].rarity_score += trait_score;
                    allTokensArr[j].rarity_score_norm += trait_score;
                    allTokensArr[j].rarity_score_avg += trait_score;
                }

                allTokensArr.sort((a, b) => {
                    return b['rarity_score_norm'] - a['rarity_score_norm'];
                })
                const rarityNormRankings = allTokensArr.slice(0);
                allTokensArr.sort((a, b) => {
                    return b['rarity_score_avg'] - a['rarity_score_avg'];
                })
                const rarityAvgRankings = allTokensArr.slice(0);

                var rankings = [];
                rankings.push(rarityNormRankings);
                rankings.push(rarityAvgRankings)

                for (var k = 0; k < 3; k++) {
                    for (var l = 0; l < 10; l++) {
                        console.log(`Rank #${l + 1} ${rankings[k][l].token_id}`);
                    }
                    console.log('-----------------------------------')
                }

                client.OS_INDEX_QUEUE = client.OS_INDEX_QUEUE.filter((value) => value != collection_slug);
                resolve('Finished');

            }).catch(err => {
                reject('Error while searching for collection. Check for typos or try again.');
            });
    })
}