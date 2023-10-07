const express = require('express')
const WebSocket = require("ws")
const axios = require("axios")
const mysql = require("mysql")
const { Storage } = require('@google-cloud/storage');
const nodemailer = require("nodemailer")
const storage = new Storage();
const apiConfig = require("./googleapi.json")

const googleApiKey = apiConfig.googleApiKey

const app = express()
const port = 3000

//Configuração nodemailer
//https://www.freecodecamp.org/portuguese/news/como-usar-o-nodemailer-para-enviar-emails-do-seu-servidor-do-node-js/
let transporter = nodemailer.createTransport({
service: 'gmail',
    auth: {
        type: 'OAuth2',
        user: apiConfig.mailUser.user,
        pass: apiConfig.mailUser.pass,
        clientId: apiConfig.web.client_id,
        clientSecret: apiConfig.web.client_secret,
        refreshToken: apiConfig.web.refreshToken
    }
});

const mailOptions = {
    from: apiConfig.sendMailTarget.sender,
    to: apiConfig.sendMailTarget.receiver, 
    subject: 'Bitcoin faliu',
    html: '<p>Your html here</p>'
};

//Conexão no banco gcp
const dbConfig = {
    host: apiConfig.dbConnection.host, // e.g. '127.0.0.1'
    port: 3306, // e.g. '3306'
    user: apiConfig.dbConnection.user, // e.g. 'my-db-user'
    password: apiConfig.dbConnection.password, // e.g. 'my-db-password'
    database: apiConfig.dbConnection.database, // e.g. 'my-database'
};

// Establish a connection to the database.
let pool = mysql.createPool(dbConfig);

//Cotação Dolar
let cotacaoDolar =  0;

const requestDolar = async () => {
    const res = await axios.get("https://economia.awesomeapi.com.br/last/USD-BRL")
    return res.data.USDBRL.bid
}

const initializeDolar = async () => {
    cotacaoDolar = await requestDolar();
}

initializeDolar()

const updateDolar = () => setInterval(async () => {
    //cada 30 minutos bater no endpoint e pegar novo valor do dolar
    cotacaoDolar = await requestDolar();
}, 30000)

updateDolar()

//Inicialização socket e requisição do valor BTC/USD
const socket = new WebSocket('wss://ws.coinapi.io/v1/');
socket.onopen = function (event) {
    socket.send(JSON.stringify({
        "type": "hello",
        "apikey": apiConfig.btcApiKey,
        "subscribe_data_type": ["trade"],
        "subscribe_filter_symbol_id": ["BITSTAMP_SPOT_BTC_USD$", "BITFINEX_SPOT_BTC_LTC$"]
    }));
};

socket.onmessage = function (event) {
    const bitcoin = JSON.parse(event.data);
    let timestampBtc = bitcoin.time_exchange.replace("T", " ").split(".")[0];

    const valorBrl = bitcoin.price * cotacaoDolar;

    pool.query(`INSERT INTO ValorBtc(timestamp, valor) VALUES (TIMESTAMP(" ${timestampBtc} "), ${valorBrl})`, 
    function (error, results, fields) {
        if (error) throw error;
    });

    if(valorBrl < 130000) {
        mailOptions.html = valorBrl.toString()
        transporter.sendMail(mailOptions, (err, info) => {
            if(err)
            console.log(err)
            else
            console.log(info);
        });
    }

}

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})