# HODLR 
## PROPRIETARY High Frequency Trading Algorithm

NOTE - DO NOT COPY OR USE THE CODE WRITTEN IN THE ALGORITHM FOR ANY COMMERCIAL PURPOSES THAT IS NOT APPROVED BY ME (ARUNADAY BASU)

For licensing and usage rights please contact at the following email id:
arunadaybasu@gmail.com

THIS ALGORITHM HAS BEEN RELEASED FOR EDUCATIONAL PURPOSES "ONLY" AND ALL ATTEMPTS TO USE IT COMMERCIALLY FOR ABSOLUTELY ANY PURPOSE WITHOUT LEGAL RIGHTS WILL BE REPORTED TO CONCERNED AUTHORITIES AND LITIGATED

DO NOT USE THIS ALGORITHM WITHOUT LEGAL USAGE RIGHTS

## Instructions

 1. Install Node JS and MongoDB
 2. Create blank database
 3. Install Node modules
 4. Connect Binance API
 5. Run Node application
 6. Fire APIs

### Install Node JS and MongoDB
Node JS - https://nodejs.org/
MongoDB Community Edition - https://www.mongodb.com/try/download/community

### Create blank database

Create a new database called **ustc_db_main**

Create the following collections in the database:

 1. credentials
 2. entries_ustc
 3. prices_ustc
 4. ustc_usdt_logs
 5. market_queue_usdt
 6. dec_wait_queue
 7. inc_wait_queue
 8. binance_wait_queue
 9. binance_txns_all
 10. ustc_wait_queue 
 11. ustc_txns_all

Your database should look like this:
![MongoDB Database](https://i.ibb.co/gdx84TC/Screenshot-2023-11-07-003036.png)


### Install Node modules

On Node/Git/Shell console - `npm install`

### Connect Binance API

You will need to log into your profile and Select API Management from the dropdown on the upper right corner, like shown below:

![Binance1](https://i.ibb.co/rp81pjt/Screenshot-2023-11-07-003946.png)

We will be generating new API keys to use in the application, as shown below:

![Binance2](https://i.ibb.co/R4yZjy9/Screenshot-2023-11-07-004150.png)

![Binance3](https://i.ibb.co/DLfL1yn/Screenshot-2023-11-07-004316.png)

![Binance4](https://i.ibb.co/tHMsQFg/Screenshot-2023-11-07-004255.png)

After you successfully generate a new API key, you will see the following API Key block:

![Binance5](https://i.ibb.co/7SSnpcb/Screenshot-2023-11-07-004356.png)

**NOTE -** Binance will show you the API Secret only for the first time, so remember copy both API Key and API Secret and keep it for the new step

Go back to MongoDB: to the database just created

We will create a new document in the **credentials** collection

Copy paste the following to Insert Document as shown below (if you are using a GUI):

    {
      "apiKey": "FROM PREVIOUS STEP",
      "apiSecret": "FROM PREVIOUS STEP",
      "type": "binance"
    }

![MongoDB1](https://i.ibb.co/LzsQVcq/Screenshot-2023-11-07-005636.png)

### Run Node application

On Node/Git/Shell console - `npm run start`

### Fire APIs

Install Postman - https://www.postman.com/downloads/

Fire APIs from Postman **in the following order** with a few seconds between firing APIs (after you receive confirmation on Postman fire the next)

All are GET Requests:

http://localhost:3603/binanceapi/prices/update/binance-ustc
http://localhost:3603/binanceapi/entry/create/rand-ustc
http://localhost:3603/binanceapi/entry/process/longs
http://localhost:3603/binanceapi/queue/process/ustc
http://localhost:3603/binanceapi/entry/process/shorts
http://localhost:3603/binanceapi/queue/process/usdt

Once you fire an API, you will receive a confirmation in Postman as shown below:

![Postman1](https://i.ibb.co/ChFYyz3/Screenshot-2023-11-07-010924.png)


*If you have done everything as described above,* you will see output on your **console** like the following:

![Console1](https://i.ibb.co/cyt64qL/Screenshot-2023-11-07-011258.png)


