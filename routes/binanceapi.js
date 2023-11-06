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
const dbName = 'ustc_db_main';
dbClient.connect();
console.log('Connected to MongoDB Server -- Local');
const db = dbClient.db(dbName);

// Connection URL -- REMOTE
const dbUrlRemote = 'mongodb://16.171.106.181:27017';
const dbClientRemote = new MongoClient(dbUrlRemote);
// Database Name -- REMOTE
const dbNameRemote = 'ustc_db_main';
dbClientRemote.connect();
console.log('Connected to MongoDB Server -- Remote');
const dbRemote = dbClientRemote.db(dbNameRemote);

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

// Remote Mongodb Collections
const remoteCollection1 = dbRemote.collection('entries_ustc');
const remoteCollection2 = dbRemote.collection('prices_ustc');
const remoteCollection3 = dbRemote.collection('ustc_usdt_logs');
const remoteCollection8 = dbRemote.collection('binance_txns_all');
const remoteCollection10 = dbRemote.collection('ustc_txns_all');



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

    if (countPrice >= 100) {
      await collection2.deleteMany({});
      await remoteCollection2.deleteMany({});
      countPrice = 1;
    }
    insertResult1 = await collection2.insertOne(respjson1);
    console.log(insertResult1);
    insertResult2 = await remoteCollection2.insertOne(respjson1);
    console.log(insertResult2);
    countPrice++;

  });

  job.start();

  res.header("Access-Control-Allow-Origin", "*");
  res.send(json);

});


// Step 1: A random ENTRY is registered once every hour

router.get('/entry/create/rand-ustc', async function(req, res, next) {

  const job = nodeCron.schedule("19 17 * * * *", async () => {

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
    insertResult2 = await remoteCollection1.insertOne(jsonInsert);
    console.log(insertResult2);

  });

  job.start();

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

  const job = nodeCron.schedule("10 * * * * *", async () => {

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

  const job = nodeCron.schedule("20 * * * * *", async () => {

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
          
          jsonInsertResult = {
            "orderid": filteredDocs1[i]._id,
            "price_ustc": filteredDocs2[0].result.price,
            "fees_usdt": usdtFees,
            "fees_ustc": ustcFees,
            "swaptotal_usdt": usdtValueOld,
            "swaptotal_ustc": filteredDocs1[i].quantity,
            "swapfinal_usdt": usdtValueFinal,
            "swapfinal_ustc": ustcValueFinal,
            "status": "swapped",
            "timestamp": moment().format()
          };
          console.log(jsonInsertResult);

          // await collection8.deleteMany({});
          insertResultBTxnsAll1 = await collection8.insertOne(jsonInsertResult);
          console.log(insertResultBTxnsAll1);
          insertResultBTxnsAll2 = await remoteCollection8.insertOne(jsonInsertResult);
          console.log(insertResultBTxnsAll2);

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

          const delQueueQuery1 = { _id: filteredDocs1[i]._id };
          const delQueueResult1 = await collection7.deleteOne(delQueueQuery1);
          console.log(delQueueResult1.deletedCount);

          const delQueueQuery2 = { orderid: filteredDocs1[i]._id };
          const delQueueResult2 = await collection5.deleteOne(delQueueQuery2);
          console.log(delQueueResult2.deletedCount);

          const optionsEntry = { upsert: true };
          filterEntry = { _id: filteredDocs1[i]._id };
          updateDocEntry = {
            $set: {
              "price": filteredDocs2[0].result.price,
              "quantity": ustcValueFinal,
              "status": "swapped-usdt"
            },
          };
          console.log(filteredDocs1[i]._id, filteredDocs2[0].result.price, ustcValueFinal);
          console.log(updateDocEntry);
          resultEntry1 = await collection1.updateOne(filterEntry, updateDocEntry, {});
          console.log(resultEntry1);
          // resultEntry2 = await remoteCollection1.updateOne(filterEntry, updateDocEntry, {});
          // console.log(resultEntry2);

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

  const job = nodeCron.schedule("30 * * * * *", async () => {

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

  const job = nodeCron.schedule("40 * * * * *", async () => {

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

          ustcValueOld = filteredDocs3[j].swapfinal_usdt / filteredDocs1[i].price;
          ustcValueNew = filteredDocs3[j].swapfinal_usdt / filteredDocs2[0].result.price;
          
          ustcFees = ustcValueNew * 0.003;
          ustcValueFinal = ustcValueNew - ustcFees;

          usdtValueFinal = ustcValueFinal * filteredDocs1[i].price;
          usdtFees = usdtValueFinal * 0.003;

          jsonInsertResult = {
            "orderid": filteredDocs1[i]._id,
            "price_ustc": filteredDocs2[0].result.price,
            "fees_usdt": usdtFees,
            "fees_ustc": ustcFees,
            "swaptotal_usdt": filteredDocs3[j].swapfinal_usdt,
            "swaptotal_ustc": filteredDocs3[j].swapfinal_ustc,
            "swapfinal_usdt": usdtValueFinal,
            "swapfinal_ustc": ustcValueFinal,
            "status": "swapped",
            "timestamp": moment().format()
          };
          insertResultBTxnsAll1 = await collection10.insertOne(jsonInsertResult);
          console.log(insertResultBTxnsAll1);
          insertResultBTxnsAll2 = await remoteCollection10.insertOne(jsonInsertResult);
          console.log(insertResultBTxnsAll2);

          jsonInsertLog = {
            "orderid": filteredDocs1[i]._id,
            "status": "SHORT/Successfully swapped USDT to USTC",
            "result": jsonInsertResult,
            "boolstatus": true,
            "timestamp": moment().format()
          };
          // insertResultLog1 = await collection3.insertOne(jsonInsertLog);
          // console.log(insertResultLog1);
          // insertResultLog2 = await remoteCollection3.insertOne(jsonInsertLog);
          // console.log(insertResultLog2);

          const delQueueQuery1 = { _id: filteredDocs1[i]._id };
          const delQueueResult1 = await collection9.deleteOne(delQueueQuery1);
          console.log(delQueueResult1.deletedCount);

          const delQueueQuery2 = { orderid: filteredDocs1[i]._id };
          const delQueueResult2 = await collection6.deleteOne(delQueueQuery2);
          console.log(delQueueResult2.deletedCount);

          // const optionsEntry = { upsert: true };
          filterEntry = { _id: filteredDocs1[i]._id };
          updateDocEntry = {
            $set: {
              "price": filteredDocs2[0].result.price,
              "quantity": ustcValueFinal,
              "status": "swapped-ustc"
            },
          };
          resultEntry1 = await collection1.updateOne(filterEntry, updateDocEntry, {});
          console.log(resultEntry1);
          // resultEntry2 = await remoteCollection1.updateOne(filterEntry, updateDocEntry, {});
          // console.log(resultEntry2);

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




async function binanceSwapPools() {

  await connectToBinance();

  var res1 = null;
  binanceApiClient.bswapPools()
  .then(response => {
    // console.log(response.data);
    // return response.data;

    var cryptoarr1 = [];

    const res1 = response.data;
    for (const key1 in res1){
      if(res1.hasOwnProperty(key1)){
        // console.log(res1[key1]);

        elem1 = res1[key1]['poolName'].split('/');
        if (elem1[0] == 'ATOM') {
          cryptoarr1.push([elem1[0], elem1[1]]);
          console.log(res1[key1]['poolId'] + ' - ' + res1[key1]['poolName']);
        }

      }
    }
    // cryptoarr1 = removeDuplicates(cryptoarr1);
    console.log(cryptoarr1);

    binanceSwapPoolInfo();

    return;

  })
  .catch(error => binanceApiClient.logger.error(error))

}

async function binanceSwapPoolInfo() {

  await connectToBinance();

  var res1 = null;
  binanceApiClient.bswapLiquidity({ 'poolId' : '187' })
  .then(response => {
    console.log(response.data);
    // return response.data;

    return;

  })
  .catch(error => binanceApiClient.logger.error(error))

}

router.get('/swappools', async function(req, res, next) {
  
  // var adr = req._parsedOriginalUrl;
  // var params1 = url.parse(adr, true);
  // var params2 = params1.query.split('=');
  // var params3 = params2[1].split(',');

  binanceSwapPools()
  .then(res2 => {
    // console.log(res2);
    res.send('check console');
  })
  .catch(console.error)
  .finally();

});

router.get('/market/buy/ustc', async function(req, res, next) {

  await connectToBinance();
  
  // binanceApiClient.newOrder(
  binanceApiClient.newOrderTest(
    'LUNCUSDT', 'BUY', 'MARKET',
    {
      // 'quantity': '10.0',
      'quoteOrderQty': '10.0',
      // 'price': '0.00009',
      // 'timeInForce': 'GTC',
      'newClientOrderId': 'arubasu123'
    }
  )
  .then(response => binanceApiClient.logger.log(response.data))
  .catch(error => binanceApiClient.logger.error(error))

});

router.get('/swapquote', async function(req, res, next) {

  await connectToBinance();

  binanceApiClient.bswapRequestQuote('USDT', 'ATOM', 100)
  .then(response => {
    console.log(response.data);
    res.send(response.data);
  })
  .catch(error => {
    console.log(error.code);
  })

});

router.get('/permissions', async function(req, res, next) {

  await connectToBinance();
  
  binanceApiClient.apiPermissions({})
  .then( (response) => {
    console.log(response.data);
    res.send(response.data);
  })
  .catch(error => binanceApiClient.logger.error(error))

});

router.get('/all-coins', async function(req, res, next) {

  await connectToBinance();
  
  binanceApiClient.coinInfo({})
  .then( (response) => {
    console.log(response.data);
    res.send(response.data);
  })
  .catch(error => binanceApiClient.logger.error(error))

});

router.get('/snapshot', async function(req, res, next) {

  await connectToBinance();
  
  binanceApiClient.accountSnapshot('SPOT')
  .then( (response) => {
    console.log(response.data);
    res.send(response.data);
  })
  .catch(error => binanceApiClient.logger.error(error))

});

router.get('/deposit-address', async function(req, res, next) {

  await connectToBinance();
  
  binanceApiClient.depositAddress('LUNC', {})
  .then( (response) => {
    console.log(response.data);
    res.send(response.data);
  })
  .catch(error => binanceApiClient.logger.error(error))

});

router.get('/user-asset', async function(req, res, next) {

  await connectToBinance();
  
  binanceApiClient.userAsset({})
  .then( (response) => {
    console.log(response.data);
    res.send(response.data);
  })
  .catch(error => binanceApiClient.logger.error(error))

});

router.get('/withdraw-history', async function(req, res, next) {

  await connectToBinance();
  
  binanceApiClient.withdrawHistory({})
  .then( (response) => {
    console.log(response.data);
    res.send(response.data);
  })
  .catch(error => binanceApiClient.logger.error(error))

});

router.get('/binance-deposit-history', async function(req, res, next) {

  await connectToBinance();

  binanceApiClient.depositHistory({
    'startTime': 1664582400000,
    'endTime': 1669766400000
  })
  .then( async (response) => {

    var filteredDocs1, insertResult;

    console.log(response.data);
    res.send(response.data);

    // Use connect method to connect to the server
    await dbClient.connect();
    console.log('Connected successfully to MongoDB Server');
    const db = dbClient.db(dbName);
    const collection_txs = db.collection('binance_txns_all');
    // await collection_txs.deleteMany({});

    const respjson1 = response.data;

    for (a = 0; a < respjson1.length; a++) {

      filteredDocs1 = await collection_txs.find({'txId': respjson1[a].txId}).toArray();
      if (filteredDocs1.length == 0) {
        console.log("No record found - " + respjson1[a].id);
        insertResult = await collection_txs.insertOne(respjson1[a]);
        console.log('Inserted document =>', insertResult);
      }
      else {
        console.log("Record found - " + respjson1[a].id);
      }

    }

    


  })
  .catch(error => binanceApiClient.logger.error(error))

});

router.get('/update-ustc-wallet-txns', async function(req, res, next) {

  // to do -- navigation using offset - need many txns on wallet

  await connectToBinance();

  var offset = 0;

  const json = {
    "status": 200,
    "timestamp": moment().format()
  };

  res.header("Access-Control-Allow-Origin", "*");
  res.send(json);

  new Promise(async (resolve, reject) => {

    try {
      response = await axios.get(fcdURL + 'txs?offset=' + offset + '&limit=100&account=' + req.query.account, {});
    } catch(ex) {
      response = null;
      // error
      console.log(ex);
      // reject(ex);
    }

    if (response) {

      var filteredDocs1, insertResult, flag = 0;

      console.log(response.data.txs.length);
      const respjson1 = response.data.txs;

      // offset = response.data.next;

      // Use connect method to connect to the server
      await dbClient.connect();
      console.log('Connected successfully to MongoDB Server');
      const db = dbClient.db(dbName);
      const collection_txs = db.collection('wallet_txns_ustc');

      filteredDocs1 = await collection_txs.find({}).sort( { 'timestamp': -1 } ).toArray();
      // if (filteredDocs1.length == 0)
      //   offset = 0;
      console.log(filteredDocs1.length);

      for (a = 0; a < respjson1.length; a++) {

        for (b = 0; b < filteredDocs1.length; b++) {

          if ( respjson1[a].txhash == filteredDocs1[b].txhash ) {
            console.log("Record found - " + filteredDocs1[b].txhash);
            flag = 1;
            break;
          }
          
        }

        if (flag == 0) {
          console.log("No record found - " + respjson1[a].txhash);
          insertResult = await collection_txs.insertOne(respjson1[a]);
          console.log('Inserted document =>', insertResult);
        } else {
          flag = 0;
        }

      }


    }

  });

});

router.get('/separate-ustc-wallet-txns', async function(req, res, next) {

  await connectToBinance();

  var filteredDocs1, insertResult, flag = 0, splitMemo, filteredDocs2;

  const json = {
    "status": 200,
    "timestamp": moment().format()
  };

  res.header("Access-Control-Allow-Origin", "*");
  res.send(json);
  
  await dbClient.connect();
  console.log('Connected successfully to MongoDB Server');
  const db = dbClient.db(dbName);
  const collection_txs = db.collection('wallet_txns_ustc');
  const collection_coins = db.collection('all_coins');
  const collection_q_refund = db.collection('txns_queue_to_refund');
  const collection_q_binance = db.collection('txns_queue_to_binance');
  const collection_logs = db.collection('txns_logs');

  filteredDocs1 = await collection_txs.find({}).sort( { 'timestamp': -1 } ).toArray();
  // console.log(filteredDocs1.length);

  for (a = 0; a < filteredDocs1.length; a++) {

    splitMemo = filteredDocs1[a].tx.value.memo.split(';');

    filteredDocsRefund = await collection_q_refund.find({'txhash': filteredDocs1[a].txhash}).toArray();
    // console.log(filteredDocsRefund.length);

    filteredDocsBinance = await collection_q_binance.find({'txhash': filteredDocs1[a].txhash}).toArray();
    // console.log(filteredDocsBinance.length);

    if ( (filteredDocs1[a].tx.value.msg[0].type == 'bank/MsgSend') && 
      (filteredDocsRefund.length == 0) && 
      (filteredDocsBinance.length == 0) ) {

      if ( (splitMemo[0] == filteredDocs1[a].tx.value.memo) || (splitMemo[0] == '') ) {

        console.log('Memo not valid - ' + filteredDocs1[a].height);
        qInsertDoc = {
          'refundaddress': filteredDocs1[a].tx.value.msg[0].value.from_address,
          'totalvalue': filteredDocs1[a].tx.value.msg[0].value.amount[0].amount,
          'txhash': filteredDocs1[a].txhash,
          'height': filteredDocs1[a].height,
          'refundreason': 'MemoFormatNotValid',
          'timestamp': moment().valueOf()
        };
        insertResult = await collection_q_refund.insertOne(qInsertDoc);
        console.log(insertResult);

        logInsertDoc = {
          'txhash': filteredDocs1[a].txhash,
          'height': filteredDocs1[a].height,
          'laststatus': 'Transaction will be refunded. Incorrect Memo Format Sent.',
          'timestamp': moment().valueOf()
        };
        insertResultLog = await collection_logs.insertOne(logInsertDoc);
        console.log(insertResultLog);

      }
      else {

        filteredDocs2 = await collection_coins.find({
          'coin': splitMemo[0]
        }).toArray();

        if (filteredDocs2.length > 0) {

          for (b = 0; b < filteredDocs2[0].networkList.length; b++) {

            // console.log( isValidAddress(splitMemo[1],filteredDocs2[0].networkList[b].addressRegex) );

            if( isValidAddress(splitMemo[1],filteredDocs2[0].networkList[b].addressRegex) ) {

              if (splitMemo[2] == undefined) {

                console.log('No price given - ' + filteredDocs1[a].height);
                qInsertDoc = {
                  'swapcoin': splitMemo[0],
                  'swapaddress': splitMemo[1],
                  'swapprice': 'market',
                  'totalswapvalue': filteredDocs1[a].tx.value.msg[0].value.amount[0].amount,
                  'txhash': filteredDocs1[a].txhash,
                  'height': filteredDocs1[a].height,
                  'timestamp': moment().valueOf()
                };
                insertResult = await collection_q_binance.insertOne(qInsertDoc);
                console.log(insertResult);

                logInsertDoc = {
                  'txhash': filteredDocs1[a].txhash,
                  'height': filteredDocs1[a].height,
                  'laststatus': 'Transaction received. Order price not supplied. ' + filteredDocs2[0].name + ' will be swapped at market rate',
                  'timestamp': moment().valueOf()
                };
                insertResultLog = await collection_logs.insertOne(logInsertDoc);
                console.log(insertResultLog);

              }
              else {

                if (isNumeric(splitMemo[2])) {

                  console.log('All valid');
                  qInsertDoc = {
                    'swapcoin': splitMemo[0],
                    'swapaddress': splitMemo[1],
                    'swapprice': splitMemo[2],
                    'totalswapvalue': filteredDocs1[a].tx.value.msg[0].value.amount[0].amount,
                    'txhash': filteredDocs1[a].txhash,
                    'height': filteredDocs1[a].height,
                    'timestamp': moment().valueOf()
                  };
                  insertResult = await collection_q_binance.insertOne(qInsertDoc);
                  console.log(insertResult);

                  logInsertDoc = {
                    'txhash': filteredDocs1[a].txhash,
                    'height': filteredDocs1[a].height,
                    'laststatus': 'Transaction received. Order price not supplied. ' + filteredDocs2[0].name + ' will be swapped at rate of ' + splitMemo[2],
                    'timestamp': moment().valueOf()
                  };
                  insertResultLog = await collection_logs.insertOne(logInsertDoc);
                  console.log(insertResultLog);

                }
                else {

                  console.log('No price given - ' + filteredDocs1[a].height);
                  qInsertDoc = {
                    'swapcoin': splitMemo[0],
                    'swapaddress': splitMemo[1],
                    'swapprice': 'market',
                    'totalswapvalue': filteredDocs1[a].tx.value.msg[0].value.amount[0].amount,
                    'txhash': filteredDocs1[a].txhash,
                    'height': filteredDocs1[a].height,
                    'timestamp': moment().valueOf()
                  };
                  insertResult = await collection_q_binance.insertOne(qInsertDoc);
                  console.log(insertResult);

                  logInsertDoc = {
                    'txhash': filteredDocs1[a].txhash,
                    'height': filteredDocs1[a].height,
                    'laststatus': 'Transaction received. Order price not supplied. ' + filteredDocs2[0].name + ' will be swapped at market rate',
                    'timestamp': moment().valueOf()
                  };
                  insertResultLog = await collection_logs.insertOne(logInsertDoc);
                  console.log(insertResultLog);

                }

              }

            }
            else {

              console.log('Address not valid - ' + filteredDocs1[a].height);
              qInsertDoc = {
                'refundaddress': filteredDocs1[a].tx.value.msg[0].value.from_address,
                'totalvalue': filteredDocs1[a].tx.value.msg[0].value.amount[0].amount,
                'txhash': filteredDocs1[a].txhash,
                'height': filteredDocs1[a].height,
                'refundreason': 'AddressNotValid',
                'timestamp': moment().valueOf()
              };
              insertResult = await collection_q_refund.insertOne(qInsertDoc);
              console.log(insertResult);

              logInsertDoc = {
                'txhash': filteredDocs1[a].txhash,
                'height': filteredDocs1[a].height,
                'laststatus': 'Transaction will be refunded. Address does not match required format for ' + filteredDocs2[0].name,
                'timestamp': moment().valueOf()
              };
              insertResultLog = await collection_logs.insertOne(logInsertDoc);
              console.log(insertResultLog);

            }

          }

        }
        else {

          console.log('Currency no match - ' + filteredDocs1[a].height);
          qInsertDoc = {
            'refundaddress': filteredDocs1[a].tx.value.msg[0].value.from_address,
            'totalvalue': filteredDocs1[a].tx.value.msg[0].value.amount[0].amount,
            'txhash': filteredDocs1[a].txhash,
            'height': filteredDocs1[a].height,
            'refundreason': 'CoinCurrencyNotValid',
            'timestamp': moment().valueOf()
          };
          insertResult = await collection_q_refund.insertOne(qInsertDoc);
          console.log(insertResult);

          logInsertDoc = {
            'txhash': filteredDocs1[a].txhash,
            'height': filteredDocs1[a].height,
            'laststatus': 'Transaction will be refunded. Coin/Currency does not match available currencies',
            'timestamp': moment().valueOf()
          };
          insertResultLog = await collection_logs.insertOne(logInsertDoc);
          console.log(insertResultLog);

        }

      }

    }

    
    
  }

});

router.get('/mock/send-txn-binance', async function(req, res, next) {

  await connectToBinance();

  var totalToRefund = 0, totalToBinance = 0, binanceAddress, binanceMemo;

  const json = {
    "status": 200,
    "timestamp": moment().format()
  };

  res.header("Access-Control-Allow-Origin", "*");
  res.send(json);
  
  // Use connect method to connect to the server
  await dbClient.connect();
  console.log('Connected successfully to MongoDB Server');
  const db = dbClient.db(dbName);

  // const collection_txs = db.collection('wallet_txns_ustc');
  // const collection_q_refund = db.collection('txns_queue_to_refund');
  // const collection_q_refund_sent = db.collection('txns_queue_refunded');

  const collection_q_binance = db.collection('txns_queue_to_binance');
  const collection_txns_binance_all = db.collection('txns_binance_hash_all');
  const collection_binance_address_all = db.collection('binance_addresses_all');
  const collection_q_binance_sent = db.collection('txns_queue_binance_sent');

  docsToSendBinance = await collection_q_binance.find({}).toArray();

  for (a = 0; a < docsToSendBinance.length; a++) {
    totalToBinance += Number(docsToSendBinance[a].totalswapvalue);
    console.log(docsToSendBinance[a].totalswapvalue, totalToBinance);
  }
  console.log('Total to Binance - ' + totalToBinance);

  await binanceApiClient.depositAddress('LUNC', {})
  .then( (response) => {
    console.log(response.data);
    binanceAddress = response.data.address;
    binanceMemo = response.data.tag;
  })
  .catch(error => binanceApiClient.logger.error(error))

  console.log(binanceAddress, binanceMemo);

  // Create Keys and Wallet

  const keys = {
    govwallet1: new MnemonicKey({
      mnemonic:
        "fiscal book tell puppy trip front muscle wagon similar young oxygen hidden floor reward often target quarter innocent spin parade gloom satisfy flock awful",
    })
  };

  const wallet = lcd.wallet(keys.govwallet1);

  // Create and Sign MsgSend Transaction

  const send = new MsgSend(
    wallet.key.accAddress,
    binanceAddress,
    { uluna: totalToBinance }
  );
  console.log(send);

  const tx = await wallet.createAndSignTx({
    msgs: [send],
    memo: binanceMemo
  });
  console.log(tx);

  // var json = {
  //   "status": 400,
  //   "result": "Bad Request",
  //   "timestamp": moment().valueOf()
  // };

  // Estimate Correct Gas and Re-initialize Transaction

  var gasResult = await lcd.tx.estimateGas(tx);
  console.log(gasResult);
  gasResult *= 1.5;
  console.log(gasResult);

  const fee = new Fee(gasResult, { uluna: 5500000 });
  console.log(fee);

  const txFinal = await wallet.createAndSignTx({
    msgs: [send],
    memo: binanceMemo,
    fee
  });
  console.log(txFinal);

  const txHashFinal = await lcd.tx.hash(txFinal);
  console.log(txHashFinal);

  logInsertDoc = {
    'txhash': txHashFinal,
    'laststatus': 'Transaction hash generated. Transaction being sent to Binance.',
    'timestamp': moment().valueOf()
  };
  insertResultLog = await collection_logs.insertOne(logInsertDoc);
  console.log(insertResultLog);

  binanceInsertDoc = {
    'txhash': txHashFinal,
    'tx': JSON.stringify(txFinal),
    'timestamp': moment().valueOf()
  };
  
  // await collection_txns_binance_all.deleteMany({});
  const insertResultBTxnsAll = await collection_txns_binance_all.insertOne(binanceInsertDoc);
  console.log('Inserted documents =>', insertResultBTxnsAll);

  bAddInsertDoc = {
    'wallet_address': binanceAddress,
    'address_memo': binanceMemo,
    'txhash': txHashFinal,
    'timestamp': moment().valueOf()
  };
  insertResultBAdd = await collection_binance_address_all.insertOne(bAddInsertDoc);
  console.log(insertResultBAdd);

  new Promise(async (resolve, reject) => {

    try {
      response = await lcd.tx.broadcast(txFinal);
    } catch(ex) {
      response = null;
      console.log(ex);
      // reject(ex);
    }

    if (response) {

      json = {
        "status": 200,
        "result": response,
        "timestamp": moment().valueOf()
      };

      console.log(response);

      const respjson1 = {
        "result": JSON.stringify(response),
        "txfinal": JSON.stringify(txFinal),
        "txhash": txHashFinal,
        "timestamp": moment().valueOf()
      };

      await dbClient.connect();
      console.log('Connected successfully to MongoDB Server');
      const db = dbClient.db(dbName);
      const collection_txns = db.collection('txns_binance_wallet_main');
      // await collection_txns.deleteMany({});
      const insertResult = await collection_txns.insertOne(respjson1);
      console.log('Inserted documents =>', insertResult);

    }

  });

  res.header("Access-Control-Allow-Origin", "*");
  res.send(json);

});

module.exports = router;
