require("dotenv").config({ path: __dirname + "/.env" });
const { twitterClient } = require("./twitterClient.js");

const tweet = async () => {
    try {
        // First, post all your images to Twitter
        const mediaIds = await Promise.all([
            // file path
            twitterClient.v1.uploadMedia('images/Thousands turn out to welcome new Danish King.png'),
        ]);
        await twitterClient.v2.tweet({
            text: "My third automated post! \n\n Hey #testHashtag",
            media: { media_ids: mediaIds }
        });
    } catch (e) {
        console.log(e)
    }
}

tweet();