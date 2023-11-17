var express = require('express');
var router = express.Router();
var moment = require('moment');
const axios = require('axios');
const nodeCron = require("node-cron");

const { MongoClient } = require('mongodb');

const { Spot } = require('@binance/connector');
const { MainClient } = require('binance');

var res1 = "binanceapi endpoint working";

// Connection URL -- LOCAL
const dbUrl = 'mongodb://localhost:27017';
const dbClient = new MongoClient(dbUrl);
// Database Name -- LOCAL
const dbName = 'ustc_db_alt_1';
dbClient.connect();
console.log('Connected to MongoDB Server -- Local');
const db = dbClient.db(dbName);

// Connection URL -- REMOTE
// const dbUrlRemote = 'mongodb://16.171.106.181:27017';
// const dbClientRemote = new MongoClient(dbUrlRemote);
// Database Name -- REMOTE
// const dbNameRemote = 'ustc_db_main';
// dbClientRemote.connect();
// console.log('Connected to MongoDB Server -- Remote');
// const dbRemote = dbClientRemote.db(dbNameRemote);

// Local Mongodb Collections
const collection_creds = db.collection('credentials');
const collection1 = db.collection('entries_ustc');
const collection2 = db.collection('prices_ustc');
const collection3 = db.collection('ustc_usdt_logs');
const collection4 = db.collection('market_queue_usdt');
const collection5 = db.collection('dec_wait_queue');
const collection6 = db.collection('inc_wait_queue');
const collection7 = db.collection('binance_wait_queue');
const collection8 = db.collection('binance_txns_all');
const collection9 = db.collection('ustc_wait_queue');
const collection10 = db.collection('ustc_txns_all');
const collection11 = db.collection('stash_accounts');

// Remote Mongodb Collections
// const remoteCollection1 = dbRemote.collection('entries_ustc');
// const remoteCollection2 = dbRemote.collection('prices_ustc');
// const remoteCollection3 = dbRemote.collection('ustc_usdt_logs');
// const remoteCollection8 = dbRemote.collection('binance_txns_all');
// const remoteCollection10 = dbRemote.collection('ustc_txns_all');



var binanceApiClient;

async function connectToBinance() {

  const binanceApiKeys = await collection_creds.find({'type': 'binance'}).toArray();

  const apiKey = binanceApiKeys[0].apiKey;
  const apiSecret = binanceApiKeys[0].apiSecret;
  // const binanceApiClient = new Spot(apiKey, apiSecret, { baseURL: 'https://testnet.binance.vision'});
  binanceApiClient = new Spot(apiKey, apiSecret);
}

function removeDuplicates(arr) {
    return arr.filter((item, 
        index) => arr.indexOf(item) === index);
}

function isNumeric(n) {
  return !isNaN(parseFloat(n)) && isFinite(n);
}

function isValidAddress(address, regex) {
  const pattern = new RegExp(regex, 'g');
  return pattern.test(address);
}


router.get('/', function(req, res, next) {
  
  res.send(res1)

});




// Price updated every 30 seconds from Binance

router.get('/prices/update/binance-ustc', async function(req, res, next) {

  await connectToBinance();
  var respjson1, db, insertResult, countPrice = 1;

  const json = {
    "status": 200,
    "timestamp": moment().format()
  };

  const job = nodeCron.schedule("*/30 * * * * *", async () => {
  
    await binanceApiClient.tickerPrice('USTCUSDT')
    .then(response => { 
      console.log(response.data);

      respjson1 = {
        "status": 200,
        "result": response.data,
        "timestamp": moment().valueOf()
      };

    })
    .catch(error => console.error(error))

    // if (countPrice >= 100) {
    //   await collection2.deleteMany({});
    //   await remoteCollection2.deleteMany({});
    //   countPrice = 1;
    // }
    insertResult1 = await collection2.insertOne(respjson1);
    console.log(insertResult1);
    // insertResult2 = await remoteCollection2.insertOne(respjson1);
    // console.log(insertResult2);
    // countPrice++;

  });

  job.start();

  res.header("Access-Control-Allow-Origin", "*");
  res.send(json);

});


// Step 1: A random ENTRY is registered once every hour

router.get('/entry/create/rand-ustc', async function(req, res, next) {

  // const job = nodeCron.schedule("19 */30 * * * *", async () => {

    filteredDocs1 = await collection2.find().sort({"timestamp": -1}).limit(1).toArray();
    console.log(filteredDocs1[0].result.price);

    const jsonInsert = {
      "walletaddress": Math.random().toString(36).substring(2,15),
      "price": filteredDocs1[0].result.price,
      "quantity": Math.floor((Math.random() * 1000) + 1),
      "status": "created",
      "timestamp": moment().format()
    };

    // await collection1.deleteMany({});
    insertResult1 = await collection1.insertOne(jsonInsert);
    console.log(insertResult1);
    // insertResult2 = await remoteCollection1.insertOne(jsonInsert);
    // console.log(insertResult2);

  // });

  // job.start();

  const json = {
    "status": 200,
    "timestamp": moment().format()
  };

  res.header("Access-Control-Allow-Origin", "*");
  res.send(json);

});


// Step 2: All the entries are processed for LONG positions

async function longAbovePrice(orderid, priceOld, priceNew) {

  filteredDocs1 = await collection5.find({ "orderid": orderid}).sort({"timestamp": -1}).limit(1).toArray();
  // console.log(filteredDocs1.length);
  filterLong = { "orderid": orderid };
  updateDocLong = {
    $set: {
      "orderid": orderid,
      "priceOld": priceOld,
      "priceNew": priceNew,
      "timestamp": moment().format()
    }
  };
  optionsLongDoc = { upsert: true };

  if ( (filteredDocs1.length == 1) && (filteredDocs1[0].priceNew > priceNew) ) {

    priceDec = (((filteredDocs1[0].priceNew - priceNew) / filteredDocs1[0].priceNew) * 100);
    console.log(priceNew + ' decreased from ' + filteredDocs1[0].priceNew + ' = ' + priceDec + '%');

    if (priceDec >= 1.0) {

      console.log('LONG - Swap USTC to USDT...');
      
      const insertSwapQueue = {
        "orderid": orderid,
        "status": "swap",
        "timestamp": moment().format()
      };

      // await collection1.deleteMany({});
      insertResultSwapQueue = await collection7.insertOne(insertSwapQueue);
      console.log(insertResultSwapQueue);

      // const optionsEntry = { upsert: true };
      filterEntry = { "_id": orderid };
      updateDocEntry = {
        $set: {
          "price": priceOld,
          "status": "queued-usdt",
          "timestamp": moment().format()
        },
      };
      resultEntry1 = await collection1.updateOne(filterEntry, updateDocEntry, {});
      console.log(resultEntry1);
      // resultEntry2 = await remoteCollection1.updateOne(filterEntry, updateDocEntry, {});
      // console.log(resultEntry2);

      updateDocLong = {
        $set: {
          "orderid": orderid,
          "priceOld": priceOld,
          "priceNew": priceNew,
          "timestamp": moment().format()
        }
      };
      updateResultDec = await collection5.updateOne(filterLong, updateDocLong, optionsLongDoc);
      console.log(updateResultDec);

      jsonInsertLog = {
        "orderid": orderid,
        "status": "LONG/Swapping USTC to USDT",
        "boolstatus": true,
        "timestamp": moment().format()
      };
      // insertResultLog1 = await collection3.insertOne(jsonInsertLog);
      // console.log(insertResultLog1);
      // insertResultLog2 = await remoteCollection3.insertOne(jsonInsertLog);
      // console.log(insertResultLog2);

    }
    else if (priceDec < 1.0) {

      console.log('LONG -- WAIT FOR REDUCTION...');

      updateDocLong = {
        $set: {
          "orderid": orderid,
          "priceOld": priceNew,
          "priceNew": filteredDocs1[0].priceNew,
          "timestamp": moment().format()
        }
      };
      updateResultDec = await collection5.updateOne(filterLong, updateDocLong, optionsLongDoc);
      console.log(updateResultDec);

    }

  }
  else {

    priceInc = (((priceNew - priceOld) / priceOld) * 100);
    console.log(priceOld + ' increased to ' + priceNew + ' = ' + priceInc + '%');

    if ( priceInc < 2.0 ) {

      console.log('LONG -- NO ACTION FOR INCREASE...');

    }
    else if ( priceInc >= 2.0 ) {

      console.log('LONG -- WAIT FOR REDUCTION...');
      console.log('LONG -- UPDATED REDUCTION QUEUE...');

      updateResultDec = await collection5.updateOne(filterLong, updateDocLong, optionsLongDoc);
      console.log(updateResultDec);

    }

  }

}

async function longBelowPrice(orderid, priceOld, priceNew) {
  
  filterLong = { "orderid": orderid };
  updateDocLong = {
    $set: {
      "orderid": orderid,
      "priceOld": priceOld,
      "priceNew": priceNew,
      "timestamp": moment().format()
    }
  };
  optionsLongDoc = { upsert: true };

  priceDec = (((priceOld - priceNew) / priceOld) * 100);
  console.log(priceOld + ' decreased to ' + priceNew + ' = ' + priceDec + '%');
  if (priceDec < 1.0 )
    console.log('LONG -- NO ACTION FOR DECREASE...');
  else if (priceDec >= 1.0 ) {

    console.log('LONG - Swap USTC to USDT...');
    
    const insertSwapQueue = {
      "orderid": orderid,
      "status": "swap",
      "timestamp": moment().format()
    };

    // await collection1.deleteMany({});
    insertResultSwapQueue = await collection7.insertOne(insertSwapQueue);
    console.log(insertResultSwapQueue);

    // const optionsEntry = { upsert: true };
    filterEntry = { "_id": orderid };
    updateDocEntry = {
      $set: {
        "price": priceOld,
        "status": "queued-usdt",
        "timestamp": moment().format()
      },
    };
    resultEntry1 = await collection1.updateOne(filterEntry, updateDocEntry, {});
    console.log(resultEntry1);
    // resultEntry2 = await remoteCollection1.updateOne(filterEntry, updateDocEntry, {});
    // console.log(resultEntry2);

    updateDocLong = {
      $set: {
        "orderid": orderid,
        "priceOld": priceOld,
        "priceNew": priceNew,
        "timestamp": moment().format()
      }
    };
    updateResultDec = await collection5.updateOne(filterLong, updateDocLong, optionsLongDoc);
    console.log(updateResultDec);

    jsonInsertLog = {
      "orderid": orderid,
      "status": "LONG/Swapping USTC to USDT",
      "boolstatus": true,
      "timestamp": moment().format()
    };
    // insertResultLog1 = await collection3.insertOne(jsonInsertLog);
    // console.log(insertResultLog1);
    // insertResultLog2 = await remoteCollection3.insertOne(jsonInsertLog);
    // console.log(insertResultLog2);

  }

}

router.get('/entry/process/longs', async function(req, res, next) {

  const job = nodeCron.schedule("13 * * * * *", async () => {

    filteredDocs1 = await collection1.find({
      status: {$in: ["created", "swapped-ustc"]}
    }).sort({"timestamp": -1}).toArray();
    filteredDocs2 = await collection2.find({}).sort({"timestamp": -1}).toArray();

    console.log("Checking Number of Long Entries - " + filteredDocs1.length);

    for (i = 0; i < filteredDocs1.length; i++) {

      console.log(filteredDocs1[i].price, filteredDocs2[0].result.price);

      if (filteredDocs1[i].price == filteredDocs2[0].result.price) {

        // Price is constant -- NO ACTION
        console.log('LONG -- NO ACTION');

      }
      else if (filteredDocs1[i].price < filteredDocs2[0].result.price) {

        // Price has increased so the entry should be longed above price
        longAbovePrice(filteredDocs1[i]._id, filteredDocs1[i].price, filteredDocs2[0].result.price);

      }
      else if (filteredDocs1[i].price > filteredDocs2[0].result.price) {

        // Price has decreased so the entry should be longed below price
        longBelowPrice(filteredDocs1[i]._id, filteredDocs1[i].price, filteredDocs2[0].result.price);

      }

    }

  });

  job.start();

  const json = {
    "status": 200,
    "timestamp": moment().format()
  };

  res.header("Access-Control-Allow-Origin", "*");
  res.send(json);

});

router.get('/queue/process/usdt', async function(req, res, next) {

  const job = nodeCron.schedule("37 * * * * *", async () => {

    filteredDocs1 = await collection1.find({ "status": "queued-usdt" }).sort({"timestamp": -1}).toArray();
    filteredDocs2 = await collection2.find({}).sort({"timestamp": -1}).limit(1).toArray();

    for (i = 0; i < filteredDocs1.length; i++) {

      filteredDocs3 = await collection7.find({"orderid": filteredDocs1[i]._id}).sort({"timestamp": -1}).toArray();

      for (j = 0; j < filteredDocs3.length; j++) {

        if (filteredDocs3[j].status == 'swap') {

          console.log('----Swap to USDT');

          usdtValueOld = filteredDocs1[i].quantity * filteredDocs1[i].price;
          usdtValueNew = filteredDocs1[i].quantity * filteredDocs2[0].result.price;

          usdtFees = usdtValueNew * 0.003;
          usdtValueFinal = usdtValueNew - usdtFees;

          ustcValueFinal = usdtValueFinal / filteredDocs1[i].price;
          ustcFees = ustcValueFinal * 0.003;

          if (usdtValueFinal > usdtValueOld)
          {

            totalProfit = usdtValueFinal - usdtValueOld;
            profitPercent = ( totalProfit / usdtValueOld ) * 100;

            jsonInsertStash = {
              "orderid": filteredDocs1[i]._id,
              "usdt_profit": totalProfit,
              "usdt_profit_percent": ""+profitPercent+"%",
              "price_ustc": filteredDocs2[0].result.price,
              "timestamp": moment().format()
            };
            console.log(jsonInsertStash);

            jsonInsertResult = {
              "orderid": filteredDocs1[i]._id,
              "price_ustc": filteredDocs2[0].result.price,
              "fees_usdt": usdtFees,
              "fees_ustc": ustcFees,
              "swaptotal_usdt": usdtValueOld,
              "swaptotal_ustc": filteredDocs1[i].quantity,
              "swapfinal_usdt": (usdtValueFinal - totalProfit),
              "swapfinal_ustc": ((usdtValueFinal - totalProfit) / filteredDocs1[i].price),
              "usdt_profit": totalProfit,
              "usdt_profit_percent": ""+profitPercent+"%",
              "status": "swapped",
              "timestamp": moment().format()
            };
            console.log(jsonInsertResult);

            setTimeout(async () => {
              // await collection11.deleteMany({});
              insertResultBTxnsAll11 = await collection11.insertOne(jsonInsertStash);
              console.log(insertResultBTxnsAll11);
            }, 2000);

            setTimeout(async () => {
              // await collection8.deleteMany({});
              insertResultBTxnsAll8 = await collection8.insertOne(jsonInsertResult);
              console.log(insertResultBTxnsAll8);
            }, 2000);

            updateDocEntry = {
              $set: {
                "price": filteredDocs2[0].result.price,
                "quantity": ((usdtValueFinal - totalProfit) / filteredDocs1[i].price),
                "status": "swapped-usdt"
              },
            };
            
          }
          else
          {

            totalLoss = usdtValueOld - usdtValueFinal;
            lossPercent = ( totalLoss / usdtValueOld ) * 100;

            jsonInsertResult = {
              "orderid": filteredDocs1[i]._id,
              "price_ustc": filteredDocs2[0].result.price,
              "fees_usdt": usdtFees,
              "fees_ustc": ustcFees,
              "swaptotal_usdt": usdtValueOld,
              "swaptotal_ustc": filteredDocs1[i].quantity,
              "swapfinal_usdt": (usdtValueFinal - totalLoss),
              "swapfinal_ustc": ((usdtValueFinal - totalLoss) / filteredDocs1[i].price),
              "usdt_loss": totalLoss,
              "usdt_loss_percent": ""+lossPercent+"%",
              "status": "swapped",
              "timestamp": moment().format()
            };
            console.log(jsonInsertResult);

            setTimeout(async () => {
              // await collection8.deleteMany({});
              insertResultBTxnsAll8 = await collection8.insertOne(jsonInsertResult);
              console.log(insertResultBTxnsAll8);
            }, 2000);

            updateDocEntry = {
              $set: {
                "price": filteredDocs2[0].result.price,
                "quantity": ((usdtValueFinal - totalLoss) / filteredDocs1[i].price),
                "status": "swapped-usdt"
              },
            };

          }
          
          jsonInsertLog = {
            "orderid": filteredDocs1[i]._id,
            "status": "LONG/Successfully swapped USTC to USDT",
            "result": jsonInsertResult,
            "boolstatus": true,
            "timestamp": moment().format()
          };
          // insertResultLog1 = await collection3.insertOne(jsonInsertLog);
          // console.log(insertResultLog1);
          // insertResultLog2 = await remoteCollection3.insertOne(jsonInsertLog);
          // console.log(insertResultLog2);

          const delQueueQuery1 = { orderid: filteredDocs1[i]._id };
          setTimeout(async () => {
            const delQueueResult1 = await collection7.deleteOne(delQueueQuery1);
            console.log(delQueueResult1.deletedCount);
          }, 2000);

          const optionsEntry = { upsert: true };
          filterEntry = { _id: filteredDocs1[i]._id, status: filteredDocs1[i].status };
          console.log(filteredDocs1[i]._id, filteredDocs2[0].result.price, ((usdtValueFinal - totalProfit) / filteredDocs1[i].price));
          console.log(updateDocEntry);

          setTimeout(async () => {
            resultEntry1 = await collection1.updateOne(filterEntry, updateDocEntry, optionsEntry);
            console.log(resultEntry1);
          }, 2000);

          // resultEntry2 = await remoteCollection1.updateOne(filterEntry, updateDocEntry, {});
          // console.log(resultEntry2);

          const delQueueQuery2 = { orderid: filteredDocs1[i]._id };
          setTimeout(async () => {
            const delQueueResult2 = await collection5.deleteOne(delQueueQuery2);
            console.log(delQueueResult2.deletedCount);
          }, 2000);

          console.log('----Swap to USDT');

        }
        else {

          // Backup function to process queued swaps if swap entry has not been written

        }

      }

    }

  });

  job.start();

  const json = {
    "status": 200,
    "timestamp": moment().format()
  };

  res.header("Access-Control-Allow-Origin", "*");
  res.send(json);

});


// Step 3: All the entries are processed for SHORT positions

async function shortAbovePrice(orderid, priceOld, priceNew) {

  priceInc = (((priceNew - priceOld) / priceOld) * 100);
  console.log(priceOld + ' increased to ' + priceNew + ' = ' + priceInc + '%');
  if (priceInc < 1.0 )
    console.log('SHORT -- NO ACTION FOR INCREASE...');
  else if (priceInc >= 1.0 ) {

    console.log('SHORT - Swap USDT to USTC...');
    
    const insertSwapQueue = {
      "orderid": orderid,
      "status": "swap",
      "timestamp": moment().format()
    };

    // await collection9.deleteMany({});
    insertResultSwapQueue = await collection9.insertOne(insertSwapQueue);
    console.log(insertResultSwapQueue);

    // const optionsEntry = { upsert: true };
    filterEntry = { "_id": orderid };
    updateDocEntry = {
      $set: {
        "price": priceOld,
        "status": "queued-ustc",
        "timestamp": moment().format()
      },
    };
    resultEntry1 = await collection1.updateOne(filterEntry, updateDocEntry, {});
    console.log(resultEntry1);
    // resultEntry2 = await remoteCollection1.updateOne(filterEntry, updateDocEntry, {});
    // console.log(resultEntry2);

    updateDocShort = {
      $set: {
        "orderid": orderid,
        "priceOld": priceOld,
        "priceNew": priceNew,
        "timestamp": moment().format()
      }
    };
    updateResultDec = await collection6.updateOne(filterShort, updateDocShort, optionsShortDoc);
    console.log(updateResultDec);

    jsonInsertLog = {
      "orderid": orderid,
      "status": "SHORT/Swapping USDT to USTC",
      "boolstatus": true,
      "timestamp": moment().format()
    };
    // insertResultLog1 = await collection3.insertOne(jsonInsertLog);
    // console.log(insertResultLog1);
    // insertResultLog2 = await remoteCollection3.insertOne(jsonInsertLog);
    // console.log(insertResultLog2);

  }

}

async function shortBelowPrice(orderid, priceOld, priceNew) {

  filteredDocs1 = await collection6.find({ "orderid": orderid}).sort({"timestamp": -1}).limit(1).toArray();
  // console.log(filteredDocs1.length);
  filterShort = { "orderid": orderid };
  updateDocShort = {
    $set: {
      "orderid": orderid,
      "priceOld": priceOld,
      "priceNew": priceNew,
      "timestamp": moment().format()
    }
  };
  optionsShortDoc = { upsert: true };

  if ( (filteredDocs1.length == 1) && (filteredDocs1[0].priceNew < priceNew) ) {

    priceInc = (((priceNew - filteredDocs1[0].priceNew) / filteredDocs1[0].priceNew) * 100);
    console.log(priceNew + ' increased from ' + filteredDocs1[0].priceNew + ' = ' + priceInc + '%');

    if (priceInc >= 1.0) {

      console.log('SHORT - Swap USDT to USTC...');
      
      const insertSwapQueue = {
        "orderid": orderid,
        "status": "swap",
        "timestamp": moment().format()
      };

      // await collection9.deleteMany({});
      insertResultSwapQueue = await collection9.insertOne(insertSwapQueue);
      console.log(insertResultSwapQueue);

      // const optionsEntry = { upsert: true };
      filterEntry = { "_id": orderid };
      updateDocEntry = {
        $set: {
          "price": priceOld,
          "status": "queued-ustc",
          "timestamp": moment().format()
        },
      };
      resultEntry1 = await collection1.updateOne(filterEntry, updateDocEntry, {});
      console.log(resultEntry1);
      // resultEntry2 = await remoteCollection1.updateOne(filterEntry, updateDocEntry, {});
      // console.log(resultEntry2);

      updateDocShort = {
        $set: {
          "orderid": orderid,
          "priceOld": priceOld,
          "priceNew": priceNew,
          "timestamp": moment().format()
        }
      };
      updateResultDec = await collection6.updateOne(filterShort, updateDocShort, optionsShortDoc);
      console.log(updateResultDec);

      jsonInsertLog = {
        "orderid": orderid,
        "status": "SHORT/Swapping USDT to USTC",
        "boolstatus": true,
        "timestamp": moment().format()
      };
      // insertResultLog1 = await collection3.insertOne(jsonInsertLog);
      // console.log(insertResultLog1);
      // insertResultLog2 = await remoteCollection3.insertOne(jsonInsertLog);
      // console.log(insertResultLog2);

    }
    else if (priceInc < 1.0) {

      console.log('SHORT -- NO ACTION FOR INCREASE...');

      updateDocShort = {
        $set: {
          "orderid": orderid,
          "priceOld": priceNew,
          "priceNew": filteredDocs1[0].priceNew,
          "timestamp": moment().format()
        }
      };
      updateResultDec = await collection6.updateOne(filterShort, updateDocShort, optionsShortDoc);
      console.log(updateResultDec);

    }

  }
  else {

    priceDec = (((priceOld - priceNew) / priceOld) * 100);
    console.log(priceOld + ' decreased to ' + priceNew + ' = ' + priceDec + '%');

    if ( priceDec < 2.0 ) {

      console.log('SHORT -- NO ACTION FOR DECREASE...');

    }
    else if ( priceDec >= 2.0 ) {

      console.log('SHORT -- WAIT FOR INCREASE...');
      console.log('SHORT -- UPDATED INCREASE QUEUE...');

      updateResultDec = await collection6.updateOne(filterShort, updateDocShort, optionsShortDoc);
      console.log(updateResultDec);

    }

  }

}

router.get('/entry/process/shorts', async function(req, res, next) {

  const job = nodeCron.schedule("21 * * * * *", async () => {

    filteredDocs1 = await collection1.find({ "status": "swapped-usdt" }).sort({"timestamp": -1}).toArray();
    filteredDocs2 = await collection2.find({}).sort({"timestamp": -1}).limit(1).toArray();

    console.log("Checking Number of Short Entries - " + filteredDocs1.length);

    for (i = 0; i < filteredDocs1.length; i++) {

      console.log(filteredDocs1[i]._id);

      if (filteredDocs1[i].price == filteredDocs2[0].result.price) {

        // Price is constant -- NO ACTION 
        console.log('SHORT -- NO ACTION');

      }
      else if (filteredDocs1[i].price > filteredDocs2[0].result.price) {

        // Price has decreased so the entry should be shorted below price
        shortBelowPrice(filteredDocs1[i]._id, filteredDocs1[i].price, filteredDocs2[0].result.price);

      }
      else if (filteredDocs1[i].price < filteredDocs2[0].result.price) {

        // Price has increased so the entry should be shorted above price
        shortAbovePrice(filteredDocs1[i]._id, filteredDocs1[i].price, filteredDocs2[0].result.price);

      }

    }

  });

  job.start();

  const json = {
    "status": 200,
    "timestamp": moment().format()
  };

  res.header("Access-Control-Allow-Origin", "*");
  res.send(json);

});

router.get('/queue/process/ustc', async function(req, res, next) {

  const job = nodeCron.schedule("57 * * * * *", async () => {

    filteredDocs1 = await collection1.find({ "status": "queued-ustc" }).sort({"timestamp": -1}).toArray();
    // console.log(filteredDocs1);
    filteredDocs2 = await collection2.find({}).sort({"timestamp": -1}).limit(1).toArray();
    // console.log(filteredDocs2);

    for (i = 0; i < filteredDocs1.length; i++) {

      filteredDocs3 = await collection8.find({"orderid": filteredDocs1[i]._id}).sort({"timestamp": -1}).toArray();
      // console.log(filteredDocs3);

      for (j = 0; j < filteredDocs3.length; j++) {

        if (filteredDocs3[j].status == 'swapped') {

          console.log('----Swap to USTC');

          ustcValueOld = filteredDocs3[j].swapfinal_usdt / filteredDocs3[j].price_ustc;
          ustcValueNew = filteredDocs3[j].swapfinal_usdt / filteredDocs2[0].result.price;
          
          ustcFees = ustcValueNew * 0.003;
          ustcValueFinal = ustcValueNew - ustcFees;

          usdtValueFinal = ustcValueFinal * filteredDocs2[0].result.price;
          usdtFees = usdtValueFinal * 0.003;

          if (ustcValueFinal > ustcValueOld)
          {

            totalProfit = ustcValueFinal - ustcValueOld;
            profitPercent = ( totalProfit / ustcValueOld ) * 100;

            totalProfitUsdt = totalProfit * filteredDocs2[0].result.price;

            jsonInsertStash = {
              "orderid": filteredDocs1[i]._id,
              "usdt_profit": totalProfitUsdt,
              "usdt_profit_percent": ""+profitPercent+"%",
              "price_ustc": filteredDocs2[0].result.price,
              "timestamp": moment().format()
            };
            console.log(jsonInsertStash);

            jsonInsertResult = {
              "orderid": filteredDocs1[i]._id,
              "price_ustc": filteredDocs2[0].result.price,
              "fees_usdt": usdtFees,
              "fees_ustc": ustcFees,
              "swaptotal_usdt": filteredDocs3[j].swapfinal_usdt,
              "swaptotal_ustc": filteredDocs1[i].quantity,
              "swapfinal_usdt": (usdtValueFinal - totalProfitUsdt),
              "swapfinal_ustc": (ustcValueFinal - totalProfit),
              "usdt_profit": totalProfitUsdt,
              "usdt_profit_percent": ""+profitPercent+"%",
              "status": "swapped",
              "timestamp": moment().format()
            };
            console.log(jsonInsertResult);

            setTimeout(async () => {
              // await collection11.deleteMany({});
              insertResultBTxnsAll11 = await collection11.insertOne(jsonInsertStash);
              console.log(insertResultBTxnsAll11);
            }, 2000);

            setTimeout(async () => {
              // await collection10.deleteMany({});
              insertResultBTxnsAll10 = await collection10.insertOne(jsonInsertResult);
              console.log(insertResultBTxnsAll10);
            }, 2000);

            updateDocEntry = {
              $set: {
                "price": filteredDocs2[0].result.price,
                "quantity": (ustcValueFinal - totalProfit),
                "status": "swapped-ustc"
              },
            };
            
          }
          else
          {

            totalLoss = filteredDocs3[j].swapfinal_usdt - usdtValueFinal;
            lossPercent = ( totalLoss / filteredDocs3[j].swapfinal_usdt ) * 100;

            totalLossUstc = totalLoss * filteredDocs2[0].result.price;

            jsonInsertResult = {
              "orderid": filteredDocs1[i]._id,
              "price_ustc": filteredDocs2[0].result.price,
              "fees_usdt": usdtFees,
              "fees_ustc": ustcFees,
              "swaptotal_usdt": filteredDocs3[j].swapfinal_usdt,
              "swaptotal_ustc": filteredDocs3[j].swapfinal_ustc,
              "swapfinal_usdt": (filteredDocs3[j].swapfinal_usdt - totalLoss),
              "swapfinal_ustc": (filteredDocs3[j].swapfinal_ustc - totalLossUstc),
              "usdt_loss": totalLoss,
              "usdt_loss_percent": ""+lossPercent+"%",
              "status": "swapped",
              "timestamp": moment().format()
            };
            console.log(jsonInsertResult);

            setTimeout(async () => {
              // await collection10.deleteMany({});
              insertResultBTxnsAll10 = await collection10.insertOne(jsonInsertResult);
              console.log(insertResultBTxnsAll10);
            }, 2000);

            updateDocEntry = {
              $set: {
                "price": filteredDocs2[0].result.price,
                "quantity": (filteredDocs3[j].swapfinal_ustc - totalLossUstc),
                "status": "swapped-ustc"
              },
            };

          }

          jsonInsertLog = {
            "orderid": filteredDocs1[i]._id,
            "status": "LONG/Successfully swapped USDT to USTC",
            "result": jsonInsertResult,
            "boolstatus": true,
            "timestamp": moment().format()
          };
          // insertResultLog1 = await collection3.insertOne(jsonInsertLog);
          // console.log(insertResultLog1);
          // insertResultLog2 = await remoteCollection3.insertOne(jsonInsertLog);
          // console.log(insertResultLog2);


          const delQueueQuery1 = { orderid: filteredDocs1[i]._id };
          setTimeout(async () => {
            // runs after 2 seconds
          }, 2000);
          const delQueueResult1 = await collection9.deleteOne(delQueueQuery1);
          console.log(delQueueResult1.deletedCount);

          const optionsEntry = { upsert: true };
          filterEntry = { _id: filteredDocs1[i]._id, status: filteredDocs1[i].status };
          console.log(filteredDocs1[i]._id,
            filteredDocs2[0].result.price,
            ((usdtValueFinal - totalProfit) / filteredDocs1[i].price)
          );
          console.log(updateDocEntry);
          setTimeout(async () => {
            resultEntry1 = await collection1.updateOne(filterEntry, updateDocEntry, optionsEntry);
            console.log(resultEntry1);
          }, 2000);

          // resultEntry2 = await remoteCollection1.updateOne(filterEntry, updateDocEntry, {});
          // console.log(resultEntry2);

          const delQueueQuery2 = { orderid: filteredDocs1[i]._id };
          setTimeout(async () => {
            const delQueueResult2 = await collection6.deleteOne(delQueueQuery2);
            console.log(delQueueResult2.deletedCount);
          }, 2000);

          console.log('----Swap to USTC');

        }
        else {

          // Backup function to process queued swaps if swap entry has not been written

        }

      }

    }

  });

  job.start();

  const json = {
    "status": 200,
    "timestamp": moment().format()
  };

  res.header("Access-Control-Allow-Origin", "*");
  res.send(json);

});

module.exports = router;
