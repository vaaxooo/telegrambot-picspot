require('dotenv-flow').config();
const axios = require('axios');
const bot = require('./Telegram');

const userIndexMap = new Map();
let requestInProcess = false; // Флаг для отслеживания выполнения запроса

// Обработчик команды /start или приветственного сообщения
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Привет! Я бот для поиска картинок. Введите текстовый запрос, чтобы начать поиск.');
});

// Обработчик текстовых сообщений
bot.onText(/^(?!\/).+/, async (msg) => {
    const chatId = msg.chat.id;
    const query = msg.text;
    if (requestInProcess) {
        bot.sendMessage(chatId, 'Запрос в процессе выполнения. Пожалуйста, подождите...');
        return;
    }
    requestInProcess = true;
    try {
        const response = await searchImages({ query: query.toLocaleLowerCase(), page: 1 });

        if (response.total === 0) {
            bot.sendMessage(chatId, 'По вашему запросу ничего не найдено. Пожалуйста, попробуйте еще раз.');
            requestInProcess = false;
            return;
        }

        userIndexMap.set(chatId, {
            query,
            index: 1,
            totalPages: (response.total / 5).toFixed(0),
        });
        const images = response.hits.map((result) => {
            if(result.fullHDURL) return result.fullHDURL;
        });
        await sendImages(chatId, images);
    } catch (error) {
        console.error('Произошла ошибка:', error);
        bot.sendMessage(chatId, 'Произошла ошибка при выполнении запроса. Пожалуйста, попробуйте еще раз позже.');
    }
    requestInProcess = false;
});


/**
 * The function `sendImages` sends a group of images to a chat, with pagination buttons to navigate
 * through the images.
 * @param chatId - The `chatId` parameter is the unique identifier for the chat or conversation where
 * the images will be sent. It is used to specify the destination of the images.
 * @param images - The `images` parameter is an array of image URLs that you want to send. Each URL
 * represents an image that will be sent in the chat.
 * @returns a promise that resolves to the result of the `bot.sendMediaGroup` method.
 */
async function sendImages(chatId, images) {
    try {
        const currentIndex = userIndexMap.get(chatId).index || 1;
        const imagesToSend = images.slice(currentIndex, currentIndex + 5);
    
        const mediaGroup = imagesToSend.map((image) => ({
            type: 'photo',
            media: image,
        }));
    
        if(mediaGroup.length === 0) return;

        let messagesIds = [];
        return bot.sendMediaGroup(chatId, mediaGroup).then((res) => {
            messagesIds = res.map((message) => message.message_id);
            const paginationButtons = [];
      
            if(currentIndex > 1) paginationButtons.push({ text: 'Назад', callback_data: '<' });
            if(currentIndex < userIndexMap.get(chatId).totalPages) paginationButtons.push({ text: 'Далее', callback_data: '>' });
      
            if (paginationButtons.length > 0) {
                bot.sendMessage(chatId, 'Выберите действие:', { reply_markup: { inline_keyboard: [paginationButtons] } }).then((res) => {
                    messagesIds.push(res.message_id);
                    userIndexMap.set(chatId, { ...userIndexMap.get(chatId), messagesIds: messagesIds });
                })
            }
        })
    } catch (e) {
        console.log(e);
    }
}



bot.on('callback_query', async (query) => {
    try {
        const chatId = query.message.chat.id;
        const queryData = query.data;
        const currentIndex = userIndexMap.get(chatId)?.index || 1;
        const totalPages = userIndexMap.get(chatId)?.totalPages || 0;
        let newIndex = currentIndex;
    
        let response, images;
        switch (queryData) {
            case '<':
                newIndex = currentIndex - 1 >= 0 ? currentIndex - 1 : 1;
                userIndexMap.set(chatId, { ...userIndexMap.get(chatId), index: newIndex });
                response = await searchImages({ query: userIndexMap.get(chatId)?.query, page: newIndex });
                images = response.hits.map((result) => { if(result.fullHDURL) return result.fullHDURL; });
                await deleteMessages(chatId);
                await sendImages(chatId, images);
                break;
            case '>':
                newIndex = currentIndex + 1;
                userIndexMap.set(chatId, { ...userIndexMap.get(chatId), index: newIndex });
                response = await searchImages({ query: userIndexMap.get(chatId)?.query, page: newIndex });
                images = response.hits.map((result) => { if(result.fullHDURL) return result.fullHDURL; });
                await deleteMessages(chatId);
                await sendImages(chatId, images);
                break;
        }
    } catch (e) {
        console.log(e);
    }
});



/**
 * The function `deleteMessages` deletes the last two messages in a chat, given the chat ID, using the
 * `bot` object.
 * @param chatId - The `chatId` parameter is the unique identifier of the chat or conversation from
 * which you want to delete messages. It can be a chat ID or a channel ID.
 */
async function deleteMessages(chatId) {
    try {
        const messageIds = userIndexMap.get(chatId)?.messagesIds || [];
        for (const messageId of messageIds) {
            await bot.deleteMessage(chatId, messageId);
        }
        userIndexMap.set(chatId, { ...(userIndexMap.get(chatId) || {}), messagesIds: [] });        
    } catch (e) {
        console.log(e);
    }
}

/**
 * The function `searchImages` is an asynchronous function that makes a GET request to the Unsplash API
 * to search for photos based on the provided parameters.
 * @param params - The `params` parameter is an object that contains the query parameters for the image
 * search. These parameters can include:
 * @returns The response object from the API call is being returned.
 */
async function searchImages(params) {
    try {
        const { data: response } = await axios.get(`https://pixabay.com/api/`, {
            params: {
                key: process.env.PIXABAY_ACCESS_KEY,
                image_type: 'photo',
                pretty: true,
                q: (params.query).toLocaleLowerCase(),
                page: params.page,
            }
        });
        // const { data: response } = await axios.get('https://api.unsplash.com/search/photos?client_id=' + process.env.UNSPLASH_ACCESS_KEY, {params});
        return response;
    } catch (e) {
        console.log(e);
    }
}

bot.startPolling();