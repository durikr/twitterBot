const CronJob = require("cron").CronJob;
const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');
require("dotenv").config({ path: __dirname + "/.env" });
const { twitterClient } = require("./twitterClient.js");

const express = require('express')
const app = express()
const port = process.env.PORT || 4000;

const newsSite = 'https://www.bbc.com';

app.listen(port, () => {
  console.log(`Listening on port ${port}`)
})

const OpenAI = require("openai");
const openai = new OpenAI();

class BreakingNews{
    constructor(breakingNewsTitle, breakingNewsLink) {
        this.breakingNewsTitle = breakingNewsTitle,
        this.breakingNewsAuthor = '',
        this.breakingNewsLink = breakingNewsLink,
        this.breakingNewsSummary = '',
        this.breakingNewsImageLink = ''
    }
}

const getBreakingNews = async () => {
    try {
        const { data } = await axios.get(newsSite + '/news');
        const $ = cheerio.load(data);
        const breakingNews = [];
        $('div.nw-c-most-read__items > ol > li > span > div > a').each((_idx, el) => {
            const breakingNewsTitle = String($(el).text());
            const breakingNewsLink = newsSite + $(el).attr('href');
            const breakingNewsObject = new BreakingNews(breakingNewsTitle, breakingNewsLink)
            breakingNews.push({
                breakingNewsObject
            })
        });
        return breakingNews;
    } catch (error) {
        throw error;
    }
}

//// Functions for getting further details for each article
// Get the Author from the article
const getBreakingNewsAuthor = async (detailLink) => {
    try {
        let author = '';
        const { data } = await axios.get(detailLink);
        const $ = cheerio.load(data);
        $('div.ssrcss-68pt20-Text-TextContributorName').each((_idx, el) => {
            author = String($(el).text());
        });
        return author;
    } catch (error) {
        throw error;
    }
};

// Get the summary from the article
const getBreakingNewsSummary = async (detailLink) => {
    try {
        let summary = '';
        const { data } = await axios.get(detailLink);
        const $ = cheerio.load(data);
        $('p.ssrcss-1q0x1qg-Paragraph > b').each((_idx, el) => {
            summary = String($(el).text());
            if (summary === '.'){
                summary = 'Green duck under a bridge';
            }
        });
        return summary;
    } catch (error) {
        throw error;
    }
};

const downloadImage = async (url, filepath) => {
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream'
    });
    return new Promise((resolve, reject) => {
        response.data.pipe(fs.createWriteStream(filepath))
            .on('error', reject)
            .once('close', () => resolve(filepath)); 
    });
}

// Prüfe, ob der Prompt, der an OpenAI gesendet werden soll
// geflagged wird
async function getModeration(input) {
    const moderation = await openai.moderations.create(
        { 
            input: input
        });
    return moderation.results[0].flagged;
}

// Generate Image in DALLEE-2
async function generateImage(prompt) {
    try{
        const image = await openai.images.generate(
            { 
            model: "dall-e-3", 
            prompt: prompt,
            //size: "256x256",
            });
        return image.data;
    } catch (e) {
        console.log(e);
    }
}

const tweet = async (filePath, title, author, link) => {
    try {
        const newTitle = title.replaceAll('"', '').replaceAll('’', '').replaceAll("-", '').replaceAll(":", '').replaceAll("'", '');
        const wordArray = newTitle.split(' ');
        let hashtags = '';
        for (i=0; i<wordArray.length; i++) {
            hashtags += '#' + wordArray[i] + ' ';
        }
        // First, post all your images to Twitter
        const mediaIds = await Promise.all([
            // file path
            twitterClient.v1.uploadMedia(filePath),
        ]);
        await twitterClient.v2.tweet({
            text: `${title}\n\n${author} (${link})\n\n#news #ai #generated #pictures #bbc #world #breakingnews ${hashtags}`,
            media: { media_ids: mediaIds }
        });
    } catch (e) {
        console.log(e)
    }
}

// Main function, which calls all the other functions
 const cronTweet = new CronJob("15 * * * *", async () => {
    (async () => {
        const breakingNews = await getBreakingNews();
        // REAL FOR LOOP
        // But OpenAI Rate Limit is 5 Pictures/minute
        // for (i=0; i<breakingNews.length; i++) {
        for (i=0; i<1; i++) {
            const fileNameWithoutPath = breakingNews[i].breakingNewsObject.breakingNewsTitle + '.png';
            const fileName = '/Users/durikrasniqi/Documents/coding/breakingNewsPictureCreator/images/' + breakingNews[i].breakingNewsObject.breakingNewsTitle + '.png';
            const fileNames = fs.readdirSync('/Users/durikrasniqi/Documents/coding/breakingNewsPictureCreator/images/');

            if (fileNames.includes(fileNameWithoutPath)){
                console.log('No image created because image was already posted');
                break;
            }

            breakingNews[i].breakingNewsObject.breakingNewsAuthor = await getBreakingNewsAuthor(breakingNews[i].breakingNewsObject.breakingNewsLink);
            breakingNews[i].breakingNewsObject.breakingNewsSummary = await getBreakingNewsSummary(breakingNews[i].breakingNewsObject.breakingNewsLink);
            const moderation = await getModeration(breakingNews[i].breakingNewsObject.breakingNewsTitle);

            if (moderation){
                console.log('No Image created because of moderation API');
                break;

            } else {
                const imageLink = await generateImage(breakingNews[i].breakingNewsObject.breakingNewsTitle + ', in the syle of an oil painting');
                breakingNews[i].breakingNewsObject.breakingNewsImageLink = imageLink[0].url;
                await downloadImage(imageLink[0].url, '/Users/durikrasniqi/Documents/coding/breakingNewsPictureCreator/images/' + breakingNews[i].breakingNewsObject.breakingNewsTitle + '.png');
                tweet(fileName, breakingNews[i].breakingNewsObject.breakingNewsTitle, breakingNews[i].breakingNewsObject.breakingNewsAuthor, breakingNews[i].breakingNewsObject.breakingNewsLink);
                console.log(breakingNews[0]);
            }
        }
    })()
});

cronTweet.start();
console.log(cronTweet.nextDates(1));