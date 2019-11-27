'use strict';

require('dotenv').config();

/**
 * Require the dependencies
 * @type {*|createApplication}
 */
const express = require('express');
const app = express();
const path = require('path');
const OAuthClient = require('intuit-oauth');
const bodyParser = require('body-parser');
const ngrok =  (process.env.NGROK_ENABLED==="true") ? require('ngrok'):null; 
const config = require('./config.json');
const QuickBooks = require('node-quickbooks');  


/**
 * Configure View and Handlebars
 */
app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static(path.join(__dirname, '/public')));
app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');
app.use(bodyParser.json())

const urlencodedParser = bodyParser.urlencoded({ extended: false });

/**
 * App Variables
 * @type {null}
 */
let oauth2_token_json = null,
    redirectUri = '';

var qb = null;
/**
 * Instantiate new Client
 * @type {OAuthClient}
 */

let oauthClient = null;


/**
 * Home Route
 */


var customerProcess = (qbObject,shopifyCustomer) => {
    
     qbObject.findCustomers([
          {field: 'fetchAll', value: true},
          {field: 'FamilyName', value: shopifyCustomer.last_name, operator: '='},
          {field: 'GivenName', value: shopifyCustomer.first_name, operator: '='}
        ], function(err, qbcustomer) {
          if(err) console.log(err);

          if(qbcustomer.QueryResponse.Customer){
            console.log("=================Customer Already Exists In QuickBooks===================");
            console.log(qbcustomer.QueryResponse.Customer);
            console.log("=========================================================================");
           }else {
            console.log("=================Customer Is Not In QuickBooks===================");

            var newCustomer = {
              "FullyQualifiedName": "ahhahah", 
              "PrimaryEmailAddr": {
                "Address": shopifyCustomer.email
              }, 
              "DisplayName": shopifyCustomer.first_name + " " + shopifyCustomer.last_name, 
              "Suffix": "Jr", 
              "Title": null, 
              "MiddleName": "", 
              "Notes": shopifyCustomer.note, 
              "FamilyName": shopifyCustomer.last_name, 
              "PrimaryPhone": {
                "FreeFormNumber": shopifyCustomer.default_address.phone
              }, 
              "CompanyName": "aajajjaja", 
              "BillAddr": {
                "CountrySubDivisionCode": "CA", 
                "City": shopifyCustomer.default_address.city, 
                "PostalCode": shopifyCustomer.default_address.zip, 
                "Line1": shopifyCustomer.default_address.address1, 
                "Country": "Canada"
              }, 
              "GivenName": shopifyCustomer.first_name
            }


            console.log("=========================================================================");
            
            console.log(newCustomer.GivenName);
            qbObject.createCustomer(newCustomer, function(err,newCustReturn){
                if(err) console.log(err.Fault.Error);

                console.log("8888888888888"+JSON.stringify(newCustReturn));
            });

          }

          //create invoice procress  



          // var temp = JSON.stringify(qbcustomer.QueryResponse.Customer);
          // console.log("$$$$$$$$$$$"+JSON.stringify(qbcustomer.QueryResponse.Customer));
    });

};


app.get('/', function(req, res) {
    console.log("@@@@/");
    res.render('index');
});

/**
 * Get the AuthorizeUri
 */
app.get('/authUri', urlencodedParser, function(req,res) {
    console.log("@@@@/authUri");
    oauthClient = new OAuthClient({
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        environment: config.environment,
        redirectUri: config.redirectUri
    });


    const authUri = oauthClient.authorizeUri({scope:[OAuthClient.scopes.Accounting],state:'intuit-test'});
    res.send(authUri);

});


/**
 * Handle the callback to extract the `Auth Code` and exchange them for `Bearer-Tokens`
 */
app.get('/callback', function(req, res) {
    console.log("@@@@/callback");
    oauthClient.createToken(req.url)
       .then(function(authResponse) {
             oauth2_token_json = JSON.stringify(authResponse.getJson(), null,2);
         })
        .catch(function(e) {
             console.error(e);
         });
   

    res.send('');

});

/**
 * Display the token : CAUTION : JUST for sample purposes
 */
app.get('/retrieveToken', function(req, res) {
    console.log("@@@@/retrieveToken")
    res.send(oauth2_token_json);
});




//====================================================================
//=============================WORK FLOW==============================
//====================================================================

//====1.Receive Webbooks from Shopify right after the order is fulfilled.
//====2.Check if the cusomter exist. if not, then create one
//====3.Create invoice base on the infromation from Shopify

//====The problems I can see now are 1.shopify have chinese. need to remove it.     2. the data in shopify doesnt match the one in quickbooks     3. sending the data. 
app.post('/quickbooks',function(req,res){
    var shopifyData = req.body;
   
     qb = new QuickBooks(config.clientId,
                        config.clientSecret,
                        oauthClient.getToken().access_token,
                        false,
                        oauthClient.getToken().realmId,
                        true, //using sandbox
                        false, //enabling debugging
                        null,
                        '2.0',
                        oauthClient.getToken().refresh_token);


    console.log("===============Getting Info From Shopify===================");
    console.log(shopifyData.customer);
    console.log("===========================================================\n");
  
    customerProcess(qb,shopifyData.customer);
   
    

    res.send(shopifyData);
});









/**
 * Refresh the access-token
 */
app.get('/refreshAccessToken', function(req,res){

    oauthClient.refresh()
        .then(function(authResponse){
            console.log('The Refresh Token is  '+ JSON.stringify(authResponse.getJson()));
            oauth2_token_json = JSON.stringify(authResponse.getJson(), null,2);
            res.send(oauth2_token_json);
        })
        .catch(function(e) {
            console.error(e);
        });


});

/**
 * getCompanyInfo ()
 */
app.get('/getCompanyInfo', function(req,res){


    const companyID = oauthClient.getToken().realmId;

    const url = oauthClient.environment == 'sandbox' ? OAuthClient.environment.sandbox : OAuthClient.environment.production ;

    oauthClient.makeApiCall({url: url + 'v3/company/' + companyID +'/companyinfo/' + companyID})
        .then(function(authResponse){
            console.log("The response for API call is :"+JSON.stringify(authResponse));
            res.send(JSON.parse(authResponse.text()));
        })
        .catch(function(e) {
            console.error(e);
        });
});

/**
 * disconnect ()
 */
app.get('/disconnect', function(req,res){

  console.log('The disconnect called ');
  const authUri = oauthClient.authorizeUri({scope:[OAuthClient.scopes.OpenId,OAuthClient.scopes.Email],state:'intuit-test'});
  res.redirect(authUri);

});



/**
 * Start server on HTTP (will use ngrok for HTTPS forwarding)
 */
const server = app.listen(process.env.PORT || 8000, () => {

    console.log(`💻 Server listening on port ${server.address().port}`);
if(!ngrok){
    redirectUri = `${server.address().port}` + '/callback';
    console.log(`💳  Step 1 : Paste this URL in your browser : ` + 'http://localhost:' + `${server.address().port}`);
    console.log('💳  Step 2 : Copy and Paste the clientId and clientSecret from : https://developer.intuit.com')
    console.log(`💳  Step 3 : Copy Paste this callback URL into redirectURI :` + 'http://localhost:' + `${server.address().port}` + '/callback');
    console.log(`💻  Step 4 : Make Sure this redirect URI is also listed under the Redirect URIs on your app in : https://developer.intuit.com`);
}

});

/**
 * Optional : If NGROK is enabled
 */
if (ngrok) {

    console.log("NGROK Enabled");
    ngrok.connect({addr: process.env.PORT || 8000}, (err, url) => {
            if (err) {
                process.exit(1);
            }
            else {
                redirectUri = url + '/callback';
                console.log(`💳 Step 1 : Paste this URL in your browser :  ${url}`);
                console.log('💳 Step 2 : Copy and Paste the clientId and clientSecret from : https://developer.intuit.com')
                console.log(`💳 Step 3 : Copy Paste this callback URL into redirectURI :  ${redirectUri}`);
                console.log(`💻 Step 4 : Make Sure this redirect URI is also listed under the Redirect URIs on your app in : https://developer.intuit.com`);

            }
        }
    );
}

