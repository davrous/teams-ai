// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

// Import required packages
import { config } from 'dotenv';
import * as path from 'path';
import * as restify from 'restify';

// Import required bot services.
// See https://aka.ms/bot-services to learn more about the different parts of a bot.
import {
    CloudAdapter,
    ConfigurationBotFrameworkAuthentication,
    ConfigurationBotFrameworkAuthenticationOptions,
    MemoryStorage,
    ActivityTypes
} from 'botbuilder';

// Read botFilePath and botFileSecret from .env file.
const ENV_FILE = path.join(__dirname, '..', '.env');
config({ path: ENV_FILE });

const botFrameworkAuthentication = new ConfigurationBotFrameworkAuthentication(
    process.env as ConfigurationBotFrameworkAuthenticationOptions
);

// Create adapter.
// See https://aka.ms/about-bot-adapter to learn more about how bots work.
const adapter = new CloudAdapter(botFrameworkAuthentication);

// Create storage to use
//const storage = new MemoryStorage();

// Catch-all for errors.
const onTurnErrorHandler = async (context, error) => {
    // This check writes out errors to console log .vs. app insights.
    // NOTE: In production environment, you should consider logging this to Azure
    //       application insights.
    console.error(`\n [onTurnError] unhandled error: ${error}`);

    // Send a trace activity, which will be displayed in Bot Framework Emulator
    await context.sendTraceActivity(
        'OnTurnError Trace',
        `${error}`,
        'https://www.botframework.com/schemas/error',
        'TurnError'
    );

    // Send a message to the user
    await context.sendActivity('The bot encountered an error or bug.');
    await context.sendActivity('To continue to run this bot, please fix the bot source code.');
};

// Set the onTurnError for the singleton CloudAdapter.
adapter.onTurnError = onTurnErrorHandler;

// Create HTTP server.
const server = restify.createServer();
server.use(restify.plugins.bodyParser());

server.listen(process.env.port || process.env.PORT || 3978, () => {
    console.log(`\n${server.name} listening to ${server.url}`);
    console.log('\nGet Bot Framework Emulator: https://aka.ms/botframework-emulator');
    console.log('\nTo talk to your bot, open the emulator select "Open Bot"');
});

import { AdaptiveCardSearchResult, Application } from 'botbuilder-m365';
import { createDynamicSearchCard, createStaticSearchCard } from './cards';
import axios from 'axios';

// Define storage and application
const storage = new MemoryStorage();
const app = new Application({
    storage
});

// Listen for new members to join the conversation
app.conversationUpdate('membersAdded', async (context, state) => {
    const membersAdded = context.activity.membersAdded;
    for (let member = 0; member < membersAdded.length; member++) {
        // Ignore the bot joining the conversation
        if (membersAdded[member].id !== context.activity.recipient.id) {
            await context.sendActivity(
                `Hello and welcome! With this sample you can see the functionality of static and dynamic search in adaptive card`
            );
        }
    }
});

// Listen for messages that trigger returning an adaptive card
app.message(/dynamic/i, async (context, state) => {
    const attachment = createDynamicSearchCard();
    await context.sendActivity({ attachments: [attachment] });
});

app.message(/static/i, async (context, state) => {
    const attachment = createStaticSearchCard();
    await context.sendActivity({ attachments: [attachment] });
});

// Listen for query from dynamic search card
app.adaptiveCards.search('npmpackages', async (context, state, query) => {
    // Execute query
    const searchQuery = query.parameters['queryText'] ?? '';
    const count = query.count ?? 10;
    const response = await axios.get(
        `http://registry.npmjs.com/-/v1/search?${new URLSearchParams({
            text: searchQuery,
            size: count.toString()
        }).toString()}`
    );

    // Format search results
    const npmPackages: AdaptiveCardSearchResult[] = [];
    response.data.objects.forEach((obj) => {
        const result: AdaptiveCardSearchResult = {
            title: obj.package.name,
            value: `${obj.package.name} - ${obj.package.description}`
        };

        npmPackages.push(result);
    });

    // Return search results
    return npmPackages;
});

interface SubmitData {
    choiceSelect: string;
}

// Listen for submit buttons
app.adaptiveCards.actionSubmit('DynamicSubmit', async (context, state, data: SubmitData) => {
    await context.sendActivity(`Dynamically selected option is: ${data.choiceSelect}`);
});

app.adaptiveCards.actionSubmit('StaticSubmit', async (context, state, data: SubmitData) => {
    await context.sendActivity(`Statically selected option is: ${data.choiceSelect}`);
});

// Listen for ANY message to be received. MUST BE AFTER ANY OTHER HANDLERS
app.activity(ActivityTypes.Message, async (context, state) => {
    await context.sendActivity(`Try saying "static search" or "dynamic search".`);
});

// Listen for incoming server requests.
server.post('/api/messages', async (req, res) => {
    // Route received a request to adapter for processing
    await adapter.process(req, res as any, async (context) => {
        // Dispatch to application for routing
        await app.run(context);
    });
});