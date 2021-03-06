//  await 等待一个promise 的状态变成resolve 或reject ,resolve是用来改变promise状态为resolve的,reject的改变promise状态为reject的  ，在回调中调这两个方法,可以使Promise状态变化

let tabsWithTask = []; //记录了分配的任务的tab有哪几个,到时候要催数据
let waitTabs = []; //记录需要等待完成状态的URL有哪些
let db = undefined;

let NUM_OF_WORKERS = 10;
let NUM_OF_BIN_SEARCH = 3;
let host = "";
let showImage = true; // 是否显示图片,字体和CSS
let showFont = true;
let showStyle = true;
let currentTabid = undefined;
let MAX_ONE_PAGE_NUMBERS = 10;
let REVIEW_YEAR_RANGE = 4;
let tabWithAsin = {};
let valid = true;
let pageSize = 3;
let validDate = {};
let stopTask = false;
let reviewTime = 1000;
let generalTime = 10;
let isbusy = false;
let keep_haved = true;
let batchSize = 200;
let LoadingTimeout = 10; //默认10s
chrome.browserAction.setBadgeText({ text: '' });
chrome.browserAction.setBadgeBackgroundColor({ color: [0, 0, 0, 0] });
const wait = (ms) => new Promise((resolve, reject) => {
    setTimeout(resolve, ms);
});

function showPic() {
    stopTask = true;
    showImage = showStyle = showFont = true; //恢复图片  CSS和font的显示
}

function setNumber(generalWorkers, reviewsWorkers, generalWorksTime, reviewsWorksTime, keep, size, psize, timeout) {
    NUM_OF_WORKERS = generalWorkers;
    NUM_OF_BIN_SEARCH = reviewsWorkers;
    generalTime = generalWorksTime;
    reviewTime = reviewsWorksTime;
    keep_haved = keep;
    batchSize = size;
    pageSize = psize;
    LoadingTimeout = timeout;
}

function echo() {
    validDate["NUM_OF_WORKERS"] = NUM_OF_WORKERS;
    validDate["NUM_OF_BIN_SEARCH"] = NUM_OF_BIN_SEARCH;
    validDate["generalTime"] = generalTime;
    validDate["reviewTime"] = reviewTime;
    validDate["keep_haved"] = keep_haved;
    validDate["batchSize"] = batchSize;
    validDate["pageSize"] = pageSize;
    validDate["LoadingTimeout"] = LoadingTimeout;
    return validDate;

}

function setValidDate(data) {
    validDate = data;
    let parseDate = Date.parse(new Date(data["Expire"]));
    let dateNow = Date.parse(new Date()); //Date.parse得到的是时间戳    
    valid = parseDate > dateNow;
}

function checkValid() {
    return valid;
}

function getReviewURLs(asin, totalPage = 1) {
    if (asin === undefined) {
        throw new Error('asin is not defined');
    }
    let urlList = [];
    if (totalPage > 500) { // 评论最多只能看5000条
        totalPage = 500;
    }
    for (let page = 1; page <= totalPage; page++) { // page 0 与page 1 所得的内容是一样的
        //https://www.amazon.cn/product-reviews/B07NC189JJ/ref=cm_cr_arp_d_viewopt_srt?pageNumber=1&sortBy=recent
        urlList.push(`https://${host}/product-reviews/${asin}/?pageNumber=${page}&sortBy=recent`);
    }
    return urlList;
}

function getAsinDetailURL(asin) { // 要获得卖家的名字,上架时间和品牌
    if (asin === undefined) {
        throw new Error('asin is not defined');
    }
    let urlList = []; //https://www.amazon.cn/dp/B00DA0EAGM/
    urlList.push(`https://${host}/dp/${asin}/`);
    return urlList;
}

function getCertainReviewURLs(asin, Page = 1) {
    if (asin === undefined) {
        throw new Error('asin is not defined');
    }
    if (Page > 500) { // 评论最多只能看5000条
        Page = 500;
    }
    let urlList = [];
    //https://www.amazon.cn/product-reviews/B07NC189JJ/ref=cm_cr_arp_d_viewopt_srt?pageNumber=1&sortBy=recent
    urlList.push(`https://${host}/product-reviews/${asin}/?pageNumber=${Page}&sortBy=recent`);
    return urlList;
}
async function getOnePageReviews(page, tabid) {
    //1. 通过该tabid，打开该page
    let asin = tabWithAsin[tabid];
    let url = getCertainReviewURLs(asin, page); //await getUrls(currentTabid, `getCertainReviewURLs('${asin}',${page})`);
    await wait(parseInt(generalTime * (Math.random() + 0.5)));
    //1.1 构造URL
    PageUpdate(tabid, url[0]);
    //注入超时停止加载的代码
    chrome.tabs.executeScript(tabid, { code: `setTimeout(()=>{window.stop();},${LoadingTimeout*1000})`, runAt: "document_start" });
    //2. 等待该tabid加载完成
    //await Promise.race([awaitOnePageLoading(tabid), wait(90000)]);
    await awaitOnePageLoading(tabid);
    await wait(parseInt(reviewTime * (Math.random() * 0.5 + 0.5)));

    return await awaitOneTabsExeScript(tabid);
}

function main_controlOnePage(asin, page, partion) {
    return new Promise(async(resolve, reject) => {
        let tempResult = [
            [-1, -1],
            [-1, -1],
            [-1, -1],
            [-1, -1],
            [-1, -1],
            asin
        ];
        let resultAll = [];
        let start = 1;
        let end = page;
        let newTabsId = await createOneTabs(); //B08531YD3D  11  B074T8NYKW 169
        tabWithAsin[newTabsId[0]] = asin;
        let targetStart = new Date().getFullYear();
        //先找2020 2017
        let data1 = await binarySearchPartion(start, end, Date.parse(targetStart + "/1/1"), newTabsId[0]);
        if (data1[0] === -1) {
            delete(tabWithAsin[newTabsId[0]]);
            chrome.tabs.remove(newTabsId[0]);
            resolve(tempResult);
            return;
        }
        //然后夹逼找 2019 和 2018
        let data2 = await binarySearchPartion(start, end, Date.parse((targetStart - 3) + "/1/1"), newTabsId[0]);
        if (data2[0] === -1) {
            delete(tabWithAsin[newTabsId[0]]);
            chrome.tabs.remove(newTabsId[0]);
            resolve(tempResult);
            return;
        }
        if (data1[0] !== -1)
            start = data1[0];
        if (data2[0] !== -1)
            end = data2[0];
        let data3 = await binarySearchPartion(start, end, Date.parse((targetStart - 1) + "/1/1"), newTabsId[0]);
        if (data3[0] === -1) {
            delete(tabWithAsin[newTabsId[0]]);
            chrome.tabs.remove(newTabsId[0]);
            resolve(tempResult);
            return;
        }
        if (data3[0] !== -1)
            start = data3[0];
        let data4 = await binarySearchPartion(start, end, Date.parse((targetStart - 2) + "/1/1"), newTabsId[0]);
        if (data4[0] === -1) {
            delete(tabWithAsin[newTabsId[0]]);
            chrome.tabs.remove(newTabsId[0]);
            resolve(tempResult);
            return;
        }
        let data5 = await binarySearchPartion(data1[0], data3[0], Date.parse(partion), newTabsId[0]);
        if (data5[0] === -1) {
            delete(tabWithAsin[newTabsId[0]]);
            chrome.tabs.remove(newTabsId[0]);
            resolve(tempResult);
            return;
        }
        resultAll.push(data1); //2020
        resultAll.push(data3); //2019
        resultAll.push(data4); //2018
        resultAll.push(data2); //2017
        resultAll.push(data5); //2019 partion
        resultAll.push(asin);
        delete(tabWithAsin[newTabsId[0]]);
        chrome.tabs.remove(newTabsId[0]);
        resolve(resultAll);
    });
}


function binarySearchPartion(start, end, target, tabid) {
    return new Promise(async(resolve, reject) => {
        let low = start;
        let high = end;
        let mid;
        let count = 0;
        let flag;
        try {
            while (high >= low) {
                mid = parseInt((low + high) / 2);
                flag = true;
                let data = await getOnePageReviews(mid, tabid);
                if (data === null || data == undefined || data.length <= 0) {
                    flag = false;
                    break;
                }
                if (data.length >= 1)
                    data = data[0];
                let dataFirst = Date.parse(data[0].date);
                let dataLast = Date.parse(data[data.length - 1].date);
                if (dataLast > target) {
                    low = mid + 1;
                } else if (dataFirst >= target && dataLast < target) {
                    //2019 2018; 2020 2018
                    count = 0;
                    for (let index in data) {
                        if (Date.parse(data[index].date) >= target)
                            count = count + 1
                    }
                    break;
                } else if (dataFirst < target) {
                    high = mid - 1;
                } else if (dataFirst === target && dataLast === target) {
                    low = mid + 1;
                } else if (dataFirst > target && dataLast === target) {
                    low = mid + 1;
                }
            }
            if (flag === false) {
                resolve([-1, -1]);
                console.log("invalid data");
                return;
            }
            if (high >= low) {
                resolve([mid, count]);
            } else {
                if (high < start) //exceed of range
                    resolve([start, 0]);
                else if (low > end)
                    resolve([end, 10]);
                else // 假如找2019，共两页 第一页都是2020 第二页2018 ，此时 low>high,那2019应该算第二页，而不是第一页
                    resolve([low, 0]); // high < low 
            }
        } catch (error) {
            resolve([-1, -1]);
            return;
        }

    })
}

function DexieDBinit() { //https://dexie.org/docs/Version/Version.stores()
    if (db === undefined) { // database table operate just need once
        db = new Dexie("sp_database");
        db.version(1).stores({
            productsList: '&asin,title,url,image,rating,reviewUrl,totalReviews,price,originalPrice,fromUrl,keywords,page,collect_date,earliest_date,brand,upDate,sellerName,current,last,before,before2,partion',
        });
    }
}

function clearDB() {
    try {
        DexieDBinit();
        db.productsList.clear(); // after download dataset,also need clear table datas?
        db.delete();
    } catch (error) {
        console.log("data clear failed");
    }
}

function CreateTask(getURL, urls, extractor, table_name, checkstopCondition, checkSaveCondition) {
    this.getURL = getURL;
    this.urls = urls;
    this.extractor = extractor;
    this.table_name = table_name;
    this.checkstopCondition = checkstopCondition;
    this.checkSaveCondition = checkSaveCondition;
}

function getUrls(tabid, getURL) {
    return new Promise((resolve, reject) => { // 根据tabid获取url列表
        chrome.tabs.executeScript(tabid, {
            file: getURL /*,runAt:"document_end"*/
        }, (data) => {
            if (data == null)
                return [];
            if (data.length >= 1)
                data = data[0];
            resolve(data);
        });
    });
}

function awaitOnePageLoading(tabid) {
    return new Promise((resolve, reject) => { // 页面可能有重定向,location.href可能被脚本改变,不再看url,而是看tab.id
        let callbackFun = function(id, info, tab) {
            if (tab.status === 'complete' && info["status"] !== undefined) { //complte 事件会触发多次,一次info为{status:'complete'} 一次为 favIconUrl: "https://www.amazon.cn/favicon.ico",如果页面有ifame,complete次数会更多,这时候需要通过url对比来判断
                if (tab.id === tabid) { // find complete in waitURLS
                    chrome.tabs.onUpdated.removeListener(callbackFun);
                    resolve("awaitPageLoading complete");
                }
            }
        };
        chrome.tabs.onUpdated.addListener(callbackFun);
    });
}

function awaitPageLoading() {
    return new Promise((resolve, reject) => { // 页面可能有重定向,location.href可能被脚本改变,不再看url,而是看tab.id
        let callbackFun = function(id, info, tab) {
            if (tab.status === 'complete' && info["status"] !== undefined) { //complte 事件会触发多次,一次info为{status:'complete'} 一次为 favIconUrl: "https://www.amazon.cn/favicon.ico",如果页面有ifame,complete次数会更多,这时候需要通过url对比来判断
                let index = waitTabs.indexOf(tab.id);
                if (index !== -1) { // find complete in waitURLS
                    waitTabs.splice(index, 1)
                }
                if (waitTabs.length === 0) {
                    chrome.tabs.onUpdated.removeListener(callbackFun);
                    resolve("awaitPageLoading complete");
                }
            }
        };
        chrome.tabs.onUpdated.addListener(callbackFun);
    });
}

function afterGetDataFun(data, table_name, checkSaveCondition) {
    if (data === undefined || data == null) { // 可能有一个页面加载超时了,得到是不是空数组,而是undefined
        return false;
    }
    let DataSaved;
    if (data[0] === undefined) {
        console.log("没有抓取到数据");
        return false;
    } else {
        DataSaved = checkSaveCondition(data[0]);
        db[table_name].bulkPut(DataSaved).then(
            () => {
                console.log("data save end");
            }
        ).catch(function(error) {
            console.error("Ooops: " + error);
        });
        return true;
    }
}

function afterGetDataFunUpdate(data, table_name, checkSaveCondition) {
    if (data === undefined || data == null) { // 可能有一个页面加载超时了,得到是不是空数组,而是undefined
        return false;
    }
    let DataSaved;
    if (data[0] === undefined) {
        console.log("没有抓取到数据");
        return false;
    } else {
        DataSaved = checkSaveCondition(data[0]);

        for (let item of DataSaved) {

            let asin = item['asin'];
            delete(item['asin']);
            db[table_name].where("asin").equals(asin).modify(item);
        }
        return true;
    }
}

function awaitOneTabsExeScript(tabid) {
    return new Promise((resolve, reject) => {
        try {
            chrome.tabs.executeScript(tabid, {
                file: "js/extractItemReviewPage.js" /*,runAt:"document_end"*/
            }, async(data) => {
                resolve(data);
            }); //end of executeScript
        } catch (e) {}
    });
}

function addTimeoutForAllTab() {
    for (let item of tabsWithTask) {
        chrome.tabs.executeScript(item, { code: `setTimeout(()=>{window.stop();},${LoadingTimeout*1000})`, runAt: "document_start" });
    }
}

function awaitTabsExeScript(tabsWithTask, extractor, afterGetDataFun, table_name, checkSaveCondition) {
    let awaitExeScript = [];
    for (let item of tabsWithTask) {
        awaitExeScript.push(new Promise((resolve, reject) => {
            try {
                chrome.tabs.executeScript(item, {
                    file: extractor /*,runAt:"document_end"*/
                }, async(data) => {
                    let flag = afterGetDataFun(data, table_name, checkSaveCondition);
                    if (flag) {
                        resolve(data[0]);
                    } else {
                        reject(false);
                    }
                }); //end of executeScript
            } catch (e) {
                console("ExeScript error maybe in chrome-error://chromewebdata/");
                waitTabs.length = 0; // clear array
                currentURLIndex = currentURLIndex - tabsWithTask.length; // forget this tasks,redo it , (will get duplicate items)
                if (currentURLIndex < 0) {
                    currentURLIndex = 0;
                }
            }
        })); // end of push
    }
    return Promise.all(awaitExeScript).then(function(datas) {
        return datas;
    }).catch(function() {
        waitTabs.length = 0; // clear array
        currentURLIndex = currentURLIndex - tabsWithTask.length; // forget this tasks,redo it , (will get duplicate items)
        if (currentURLIndex < 0) {
            currentURLIndex = 0;
        }
    });
}

function update_process(value) {
    chrome.browserAction.setBadgeText({ text: value + "%" });
}

function getCurrentTabidNew() {
    return new Promise((resolve, reject) => {
        chrome.tabs.query({
            active: true,
            currentWindow: true
        }, (tabs) => {
            resolve(tabs[0]);
        })
    });
}

function createOneTabs() {
    let workerTabList = [];
    for (let i = 0; i < 1; i++) { //打开每个标签页
        workerTabList.push(new Promise((resolve, reject) => {
                chrome.tabs.create({
                    "active": false
                }, (tab) => {
                    resolve(tab.id);
                }); // end of create
            }) // end of promise
        ); // end of push
    } // end of for
    return Promise.all(workerTabList); // 等待所有标签页创建完成
}

function createTabs() {
    let workerTabList = [];
    for (let i = 0; i < NUM_OF_WORKERS; i++) { //打开每个标签页
        workerTabList.push(new Promise((resolve, reject) => {
                chrome.tabs.create({
                    "active": false
                }, (tab) => {
                    resolve(tab.id);
                }); // end of create
            }) // end of promise
        ); // end of push
    } // end of for
    return Promise.all(workerTabList); // 等待所有标签页创建完成
}

function closeAllTabs(newTabsId) {
    for (let item of newTabsId) {
        chrome.tabs.remove(item);
    }
    newTabsId.length = 0;
}

function PageUpdate(item, url) {
    chrome.tabs.update(item, {
        url: url
    }, (tab) => {});
}

function createNotify(title, message, requireInteraction) {
    chrome.notifications.create(null, {
        type: 'basic', // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/Notifications/TemplateType
        iconUrl: 'img/icon.png',
        title: title,
        message: message,
        //buttons: [{title:'点击此处下载文件'/*,iconUrl:'icon3.png'*/}],//,{title:'按钮2的标题',iconUrl:'icon4.png'}],//https://stackoverflow.com/questions/20188792/is-there-any-way-to-insert-action-buttons-in-notification-in-google-chrome#answer-20190702
        requireInteraction: requireInteraction
    });
}


let currentURLIndex;
async function main_control(task, update) {
    DexieDBinit();
    let newTabsId = await createTabs();

    update_process(0);
    // 依次给tabs分配任务,所有tab完成后,分配下一次任务
    currentURLIndex = 0;
    while (currentURLIndex < task.urls.length) {
        if (stopTask)
            break;

        update_process(parseInt(100 * (currentURLIndex + 1) / task.urls.length));
        tabsWithTask = []; //清空一下,认为所有tab都没有任务
        for (let tabId of newTabsId) {
            if (currentURLIndex < task.urls.length) {
                tabsWithTask.push(tabId);
                waitTabs.push(tabId);
                await wait(parseInt(generalTime * (Math.random() * 0.5 + 0.5)));
                PageUpdate(tabId, task.urls[currentURLIndex]);
                currentURLIndex++;
            }
        }
        addTimeoutForAllTab(); //注入超时时间代码
        await awaitPageLoading(); //监听onUpdated  等待页面加载完成 awaitPageLoading每次都要再承诺一次(新建一个Promise)
        await wait(parseInt(generalTime * (Math.random() * 0.5 + 0.5)));
        let extractorDataArray;
        if (update)
            extractorDataArray = await awaitTabsExeScript(tabsWithTask, task.extractor, afterGetDataFunUpdate, task.table_name, task.checkSaveCondition);
        else
            extractorDataArray = await awaitTabsExeScript(tabsWithTask, task.extractor, afterGetDataFun, task.table_name, task.checkSaveCondition);
        if (task.checkstopCondition(extractorDataArray)) {
            break;
        }
    } // end of while

    closeAllTabs(newTabsId);
    update_process(100);
}

chrome.contextMenus.create({
    "title": "1. 获取商品列表",
    "contexts": ["page", "all"],
    documentUrlPatterns: [
        "*://*.amazon.com/*", "*://*.amazon.cn/*", "*://*.amazon.ca/*", "*://*.amazon.in/*", "*://*.amazon.co.uk/*", "*://*.amazon.com.au/*", "*://*.amazon.de/*", "*://*.amazon.fr/*", "*://*.amazon.it/*", "*://*.amazon.es/*"
    ],
    "onclick": async function() {
        if (isbusy) {
            createNotify("警告", "有其他任务在执行，请等待其他任务执行完成", false);
            return;
        }
        isbusy = true;
        chrome.browserAction.setBadgeBackgroundColor({ color: [255, 0, 0, 255] });
        stopTask = false;
        let currentTabidNew = await getCurrentTabidNew(); ////B08531YD3D  11  B074T8NYKW 169
        currentTabid = currentTabidNew.id;
        host = currentTabidNew.url.split('/')[2];
        let productsTask = new CreateTask("js/getProductsURLs.js", [], "js/extractProductsPage.js", "productsList", (datas) => {
            return false;
        }, (data) => {
            return data; // filter data
        });
        productsTask.urls = await getUrls(currentTabid, productsTask.getURL);
        if (productsTask.urls === null || productsTask.urls.length == 0) {
            showImage = showStyle = showFont = true; //屏蔽图片  CSS和font
            isbusy = false;
            return;
        }
        if (productsTask.urls.length > pageSize)
            productsTask.urls.length = pageSize;
        //获取url列表的方式抽出来,有的URL是由前端抓的,有的是background的数据库生成的;

        showImage = showStyle = showFont = false; //屏蔽图片  CSS和font
        await main_control(productsTask, false);
        showImage = showStyle = showFont = true; //恢复图片  CSS和font的显示
        isbusy = false;
        createNotify('1. 获取商品列表 完成', '', true);

    }
});

chrome.contextMenus.create({
    "title": "2. 修正商品评论数",
    "contexts": ["page", "all"],
    documentUrlPatterns: [
        "*://*.amazon.com/*", "*://*.amazon.cn/*", "*://*.amazon.ca/*", "*://*.amazon.in/*", "*://*.amazon.co.uk/*", "*://*.amazon.com.au/*", "*://*.amazon.de/*", "*://*.amazon.fr/*", "*://*.amazon.it/*", "*://*.amazon.es/*"
    ],
    "onclick": async function() {
        if (isbusy) {
            createNotify("警告", "有其他任务在执行，请等待其他任务执行完成", false);
            return;
        }
        isbusy = true;
        chrome.browserAction.setBadgeBackgroundColor({ color: [0, 255, 0, 255] });
        stopTask = false;
        if (currentTabid === undefined || host === "") {
            let currentTabidNew = await getCurrentTabidNew(); ////B08531YD3D  11  B074T8NYKW 169
            currentTabid = currentTabidNew.id;
            host = currentTabidNew.url.split('/')[2];
        }
        showImage = showStyle = showFont = false; //屏蔽图片  CSS和font
        //读取productCorrect，和productsList 集合做比较，如果集合相等，那说明做完了（注意剔除评论数为零的）；
        let dataRaw = await getDataList("productsList"); // 1. get asins
        if (dataRaw === null || dataRaw.length === 0) {
            showImage = showStyle = showFont = true; //屏蔽图片  CSS和font
            createNotify("警告", "待完成任务数据数为零，请确认获取过商品列表", false);
            isbusy = false;
            return;
        }
        //这里是为了获取 totalReviews rating
        //做一下筛选，去掉价格和评论数为零的，以及已经获取到的
        let dataList = [];
        for (let data of dataRaw) { //create task for one asin
            if (data['totalReviews'] === -1 || data['rating'] === -1) { // skip no reviews asin and price is 0 
                dataList.push(data);
            }
        }
        if (!keep_haved) {
            dataList = dataRaw;
        }
        if (dataList.length > batchSize)
            dataList.length = batchSize;
        //  dataList = [{ "asin": "B00K369OSU" }]; // for test
        //  dataList.length = 15  // for test
        let asinReviewsTask = new CreateTask(``, [], "js/extractReviewNumber.js", "productsList", (datas) => {
            return false; // don't need stop ,only one page
        }, (data) => {
            return data; // don't filter any data
        });
        for (let data of dataList) { //create task for one asin
            let asin = data['asin'];
            const totalPage = 1; //为获得reviews的数量,只看第一页就有的

            asinReviewsTask.urls = asinReviewsTask.urls.concat(getReviewURLs(asin, totalPage));
            //asinReviewsTask.urls = ["https://www.amazon.cn/product-reviews/B00HU65SEU/?pageNumber=1&sortBy=recent"];
        }
        await main_control(asinReviewsTask, true);
        showImage = showStyle = showFont = true; //恢复图片  CSS和font的显示
        isbusy = false;
        createNotify('2. 修正商品评论数完成', '', false);
    }
});

chrome.contextMenus.create({
    "title": "3. 获取商品最早的评论",
    "contexts": ["page", "all"],
    documentUrlPatterns: [
        "*://*.amazon.com/*", "*://*.amazon.cn/*", "*://*.amazon.ca/*", "*://*.amazon.in/*", "*://*.amazon.co.uk/*", "*://*.amazon.com.au/*", "*://*.amazon.de/*", "*://*.amazon.fr/*", "*://*.amazon.it/*", "*://*.amazon.es/*"
    ],
    "onclick": async function() {
        if (isbusy) {
            createNotify("警告", "有其他任务在执行，请等待其他任务执行完成", false);
            return;
        }
        isbusy = true;
        stopTask = false;
        chrome.browserAction.setBadgeBackgroundColor({ color: [0, 0, 255, 255] });
        if (currentTabid === undefined || host === "") {
            let currentTabidNew = await getCurrentTabidNew(); ////B08531YD3D  11  B074T8NYKW 169
            currentTabid = currentTabidNew.id;
            host = currentTabidNew.url.split('/')[2];
        }
        showImage = showStyle = showFont = false; //屏蔽图片  CSS和font

        let dataRaw = await getDataList("productsList"); // 1. get asins
        if (dataRaw === null || dataRaw.length === 0) {
            showImage = showStyle = showFont = true; //屏蔽图片  CSS和font
            createNotify("警告", "待完成任务数据数为零，请确认获取过商品列表，并且修正过评论数", false);
            isbusy = false;
            return;
        }
        //做一下筛选，去掉价格和评论数为零的，以及已经获取到的
        let dataList = [];
        for (let data of dataRaw) { //create task for one asin
            if (data['totalReviews'] != 0 && data['price'] != 0 && data['totalReviews'] != -1 && data['earliest_date'] === -1) { // skip no reviews asin and price is 0 
                dataList.push(data);
            }
        }
        if (!keep_haved) {
            dataList.length = 0;
            for (let data of dataRaw) { //create task for one asin
                if (data['totalReviews'] != 0 && data['price'] != 0 && data['totalReviews'] != -1) { // skip no reviews asin and price is 0 
                    dataList.push(data);
                }
            }
        }
        if (dataList.length > batchSize)
            dataList.length = batchSize;
        let asinReviewsTask = new CreateTask(``, [], "js/extractEarliestReview.js", "productsList", (datas) => {
            return false; // don't need stop ,only one page
        }, (data) => {
            // only get the last one ,already filter in extractor
            return data; // don't filter any data
        });

        for (let data of dataList) { //create task for one asin
            let asin = data['asin'];
            const Page = Math.ceil(data['totalReviews'] / MAX_ONE_PAGE_NUMBERS); //为获得reviews的数量,只看第一页就有的

            asinReviewsTask.urls = asinReviewsTask.urls.concat(getCertainReviewURLs(asin, Page));
            //asinReviewsTask.urls = ["https://www.amazon.cn/product-reviews/B00HU65SEU/?pageNumber=1&sortBy=recent"];
        }
        await main_control(asinReviewsTask, true);
        showImage = showStyle = showFont = true; //恢复图片  CSS和font的显示
        isbusy = false;
        createNotify('3. 获取商品最早的评论完成', '', false);
    }
});

chrome.contextMenus.create({
    "title": "4. 获取商品详情页",
    "contexts": ["page", "all"],
    documentUrlPatterns: [
        "*://*.amazon.com/*", "*://*.amazon.cn/*", "*://*.amazon.ca/*", "*://*.amazon.in/*", "*://*.amazon.co.uk/*", "*://*.amazon.com.au/*", "*://*.amazon.de/*", "*://*.amazon.fr/*", "*://*.amazon.it/*", "*://*.amazon.es/*"
    ],
    "onclick": async function() {
        if (isbusy) {
            createNotify("警告", "有其他任务在执行，请等待其他任务执行完成", false);
            return;
        }
        isbusy = true;
        stopTask = false;
        chrome.browserAction.setBadgeBackgroundColor({ color: [255, 125, 0, 255] });
        if (currentTabid === undefined || host === "") {
            let currentTabidNew = await getCurrentTabidNew(); ////B08531YD3D  11  B074T8NYKW 169
            currentTabid = currentTabidNew.id;
            host = currentTabidNew.url.split('/')[2];
        }
        showImage = showStyle = showFont = false; //屏蔽图片  CSS和font

        let dataRaw = await getDataList("productsList"); // 1. get asins
        if (dataRaw === null || dataRaw.length === 0) {
            showImage = showStyle = showFont = true; //屏蔽图片  CSS和font
            createNotify("警告", "待完成任务数据数为零，请确认获取过商品列表", false);
            isbusy = false;
            return;
        }
        //做一下筛选，去掉价格和评论数为零的，以及已经获取到的
        let dataList = [];
        for (let data of dataRaw) { //create task for one asin
            if (data['price'] != 0 && (data['brand'] === -1)) { // skip no reviews asin and price is 0 
                dataList.push(data);
            }
        }
        if (!keep_haved) {
            dataList.length = 0;
            for (let data of dataRaw) { //create task for one asin
                if (data['price'] != 0) { // skip no reviews asin and price is 0 
                    dataList.push(data);
                }
            }
        }
        if (dataList.length > batchSize)
            dataList.length = batchSize;
        let asinReviewsTask = new CreateTask(``, [], "js/extractAsinDetail.js", "productsList", (datas) => {
            return false; // don't need stop ,only one page
        }, (data) => {
            return data; // don't filter any data
        });
        for (let data of dataList) { //create task for one asin
            let asin = data['asin'];
            asinReviewsTask.urls = asinReviewsTask.urls.concat(getAsinDetailURL(asin));
            //asinReviewsTask.urls = ["https://www.amazon.cn/product-reviews/B00HU65SEU/?pageNumber=1&sortBy=recent"];
        }
        await main_control(asinReviewsTask, true);
        showImage = showStyle = showFont = true; //恢复图片  CSS和font的显示
        isbusy = false;
        createNotify("4. 获取商品详情页完成", '', false);
    }
});

chrome.contextMenus.create({
    "title": "5. 获取每年的评论统计",
    "contexts": ["page", "all"],
    documentUrlPatterns: [
        "*://*.amazon.com/*", "*://*.amazon.cn/*", "*://*.amazon.ca/*", "*://*.amazon.in/*", "*://*.amazon.co.uk/*", "*://*.amazon.com.au/*", "*://*.amazon.de/*", "*://*.amazon.fr/*", "*://*.amazon.it/*", "*://*.amazon.es/*"
    ],
    "onclick": async function() {
        if (isbusy) {
            createNotify("警告", "有其他任务在执行，请等待其他任务执行完成", false);
            return;
        }
        isbusy = true;
        stopTask = false;
        chrome.browserAction.setBadgeBackgroundColor({ color: [0, 125, 255, 255] });
        showImage = showStyle = showFont = false; //屏蔽图片  CSS和font
        DexieDBinit();
        if (currentTabid === undefined || host === "") {
            let currentTabidNew = await getCurrentTabidNew(); ////B08531YD3D  11  B074T8NYKW 169
            currentTabid = currentTabidNew.id;
            host = currentTabidNew.url.split('/')[2];
        }

        let dataRaw = await getDataList("productsList"); // 1. get asins
        if (dataRaw === null || dataRaw.length === 0) {
            showImage = showStyle = showFont = true; //屏蔽图片  CSS和font
            createNotify("警告", "待完成任务数据数为零，请确认获取过商品列表，并且修正过评论数", false);
            isbusy = false;
            return;
        }
        //做一下筛选，去掉价格和评论数为零的，以及已经获取到的
        let dataList = [];
        for (let data of dataRaw) { //create task for one asin
            if (data['totalReviews'] != 0 && data['totalReviews'] != -1 && data['current'] == -1) { // skip no reviews asin and price is 0 
                dataList.push(data);
            }
        }
        if (!keep_haved) {
            dataList.length = 0;
            for (let data of dataRaw) { //create task for one asin
                if (data['totalReviews'] != 0 && data['totalReviews'] != -1) { // skip no reviews asin and price is 0 
                    dataList.push(data);
                }
            }
        }
        dataList = drop_variant(dataList);
        if (dataList.length > batchSize)
            dataList.length = batchSize;
        update_process(0);
        let mapTable = {};
        for (let data of dataList) { //create task for one asin
            mapTable[data['asin']] = data['totalReviews'];
        }
        //dataList = [{ 'asin': "B00V5D8S3C", "totalReviews": 99 }]; //  for test //B00V5D8S3C 99
        // dataList.length=10;
        // let newTabsId = await createOneTabs(); //B08531YD3D  11  B074T8NYKW 169
        for (let index = 0; index < Math.ceil(dataList.length / NUM_OF_BIN_SEARCH); index++) {
            if (stopTask)
                break;
            let allPromise = [];
            for (let i = 0; i < NUM_OF_BIN_SEARCH; i++) {
                if ((index * NUM_OF_BIN_SEARCH + i) >= dataList.length)
                    continue;
                if (dataList[index * NUM_OF_BIN_SEARCH + i]['totalReviews'] === 0)
                    continue;

                let end = Math.ceil(dataList[index * NUM_OF_BIN_SEARCH + i]['totalReviews'] / 10);
                if (end > 500)
                    end = 500;
                let date = dataList[index * NUM_OF_BIN_SEARCH + i]['collect_date'].split('/'); //"2020/6/25"
                date[0] = (parseInt(date[0]) - 1) + "";
                date = date.join("/");
                let onePromise = main_controlOnePage(dataList[index * NUM_OF_BIN_SEARCH + i]['asin'], end, date);
                allPromise.push(onePromise);
                update_process(parseInt(100 * (index * NUM_OF_BIN_SEARCH + i) / dataList.length));
            }
            let allResult = await Promise.all(allPromise); //reference https://www.jianshu.com/p/4b0ce07d6c2

            let putDatabase = [];
            for (let oneResult of allResult) {
                let currentAsin = oneResult.pop();
                let tempResult = [];
                let validFlag = true;
                for (let item of oneResult) {
                    if (item[0] === -1) {
                        validFlag = false;
                        break;
                    }
                    tempResult.push((item[0] - 1) * 10 + item[1]);
                }
                if (validFlag === false) //判断数据是否有效，如果有效，那就保存起来
                    continue;
                //进行一次过滤,如果计算评论分页的索引大于真实评论的话，修正为真实评论
                let realResult = [];
                for (let item of tempResult) {
                    if (item > mapTable[currentAsin]) {
                        realResult.push(mapTable[currentAsin]);
                    } else {
                        realResult.push(item);
                    }
                }
                //保存数据  ASIN  CURRENT LAST BEFORE BEFORE2
                putDatabase.push({ //'&asin,current,last,before,before2'
                    'asin': currentAsin,
                    'current': (realResult[0]),
                    'last': (realResult[1] - realResult[0]),
                    'before': (realResult[2] - realResult[1]),
                    'before2': (realResult[3] - realResult[2]),
                    'partion': (realResult[1] - realResult[4])
                });
            } //end of for
            //这里要修改
            for (let item of putDatabase) {

                let asin = item['asin'];
                delete(item['asin']);
                db["productsList"].where("asin").equals(asin).modify(item);
            }
            /*
            db["productsList"].bulkPut(putDatabase  ).then(
                () => {
                    console.log("data save end");
                }
            ).catch(function(error) {
                console.error("Ooops: " + error);
            });
            */
        }
        showImage = showStyle = showFont = true; //屏蔽图片  CSS和font
        isbusy = false;
        update_process(100);
        createNotify("5. 获取每年的评论统计数据获取完成", '', false);
    }

});

chrome.contextMenus.create({
    "title": "删除之前获取的数据",
    "contexts": ["page", "all"],
    documentUrlPatterns: [
        "*://*.amazon.com/*", "*://*.amazon.cn/*", "*://*.amazon.ca/*", "*://*.amazon.in/*", "*://*.amazon.co.uk/*", "*://*.amazon.com.au/*", "*://*.amazon.de/*", "*://*.amazon.fr/*", "*://*.amazon.it/*", "*://*.amazon.es/*"
    ],
    "onclick": async function() {
        clearDB();
        createNotify('数据清除完成', '该操作后会关闭浏览器', false);
        await wait(3000);
        chrome.windows.getCurrent({}, (currentWindow) => {
            chrome.windows.remove(currentWindow.id);
        });
    }

});
//旧方法  废弃不用
// 修正review的数量和星级,因为商品列表的不准,有时候代表是是亚马逊美国  评论数为0,不需要修正
// 获取最早评论时间(该任务依赖review数的正确性)     评论数为0,不需要获取
// 获得asin的卖家信息,有可能没有  https://www.amazon.com/dp/B07QWJBVVJ/?th=1     评论数为0,不需要获取  ,这里也有品牌信息,不过评论页面也有品牌信息的
// 获得asin的创建日期  https://www.amazon.cn/dp/B07NC189JJ/ref=cm_cr_arp_d_product_top?ie=UTF8  可能有,可能没有  评论数为0,不需要获取创建日期
//  获得asin的品牌,在review页面就有的   已修正    评论数为0的,不需要获取品牌信息
/*
chrome.contextMenus.create({
    "title": "get reviews ",
    "contexts": ["page", "all"],
    documentUrlPatterns: [
        "*://*.amazon.com/*", "*://*.amazon.cn/*", "*://*.amazon.ca/*", "*://*.amazon.in/*", "*://*.amazon.co.uk/*", "*://*.amazon.com.au/*", "*://*.amazon.de/*", "*://*.amazon.fr/*", "*://*.amazon.it/*", "*://*.amazon.es/*"
    ],
    "onclick": async function () {
        currentTabid = await getCurrentTabid();
        showImage = showStyle = showFont = false; //屏蔽图片  CSS和font
        let currentYear = new Date().getFullYear();
        let dataList = await getDataList("productCorrect"); // 1. get asins
        update_process(0);
        for (let data of dataList) { //create task for one asin
            let asin = data['asin'];
            if (data['totalReviews'] === 0) { // skip no reviews asin
                continue;
            }
            const totalPage = Math.ceil(data['totalReviews'] / MAX_ONE_PAGE_NUMBERS); //获得reviews的数量,计算页数
            let asinReviewsTask = new CreateTask(`getReviewURLs('${asin}',${totalPage})`, [], "js/extractItemReviewPage.js", "reviewsList", (datas) => {
                try {
                    for (let data of datas) { // 评论数组1 评论数组2
                        if (data["length"] === undefined || data.length === 0) { // don't get anything ,stop this asin task
                            return true;
                        }
                        for (let oneReview of data) {
                            let reviewYear = parseInt(oneReview['date'].split('-')[0]);
                            if ((currentYear - reviewYear) > REVIEW_YEAR_RANGE) { // 如果是4年前的,那表示不需要抓了  // for test only get one year
                                return true;
                            }
                        }
                    }
                } catch (e) {
                    console.log(e);
                }
                return false; // false ,don't stop
            }, (data) => {
                try {
                    let result = [];
                    if (data["length"] === undefined || data.length === 0) { // don't get anything ,stop this asin task
                        return []; // false ,don't save
                    }
                    for (let oneReview of data) {
                        let reviewYear = oneReview['date'].split('-')[0];
                        if ((currentYear - reviewYear) <= REVIEW_YEAR_RANGE) { // 如果是4年前的,那表示不需要抓了  // for test only get one year
                            result.push(oneReview);
                        }
                    }
                    return result;
                } catch (e) {
                    return [];
                }

            });
            asinReviewsTask.urls = await getUrls(currentTabid, asinReviewsTask.getURL);
            update_process(currentTabid, `${dataList.indexOf(data) + 1}/${dataList.length}`);
            await main_control(asinReviewsTask, false);
        }
        showImage = showStyle = showFont = true; //恢复图片  CSS和font的显示
        createNotify('获取reviews完成', '获取reviews完成', false);
    }

});
*/

function getDataList(table) { //从indexedDB中导出数据到文件
    DexieDBinit();
    let coll = db[table].toCollection();
    /*
    coll.each(
        (item)=>{
            console.dir(item);
            dataList.push(item);
        }
    );*/
    return new Promise((resolve, reject) => {
        coll.toArray((array) => {
            resolve(array);
        });
    });
}

function downloadFile(dataList, filename) {
    let config = {
        quotes: true, //or array of booleans
        quoteChar: '"',
        escapeChar: '"',
        delimiter: ",",
        header: true,
        newline: "\r\n",
        skipEmptyLines: false, //or 'greedy',
        columns: ["collect_date", "keywords", "asin", "title", "price", "rating", "brand", /*"url", "image", "reviewUrl",*/ "upDate", "totalReviews", /*"originalPrice", "fromUrl", "page", */ "current", "last", "before", "before2", "partion", "earliest_date", "estimate_year", "sellerName"] //or array of strings
    }; // dataList 里面如果出现#号,就会出错的
    var csv_content = Papa.unparse(dataList, config); // change dataList Array to csv File  use papaparse
    //https://stackoverflow.com/questions/54793997/export-indexeddb-object-store-to-csv
    // if use uri with tag a ,will lose data  --- let url = "data:text/csv;charset=utf-8,%EF%BB%BF" + csv_content; ink.href = url;
    let blob = new Blob(['\uFEFF' + csv_content], {
        type: "text/csv,charset=UTF-8"
    }); //https://blog.csdn.net/weixin_33963594/article/details/91586662

    let url = URL.createObjectURL(blob);
    chrome.downloads.download({
        url: url,
        filename: filename
    });

}

function drop_variant(dataList) {
    let dictOfHave = {};
    let dataFiltered = [];
    for (let row of dataList) {
        if (!dictOfHave.hasOwnProperty(row['brand'] + '_' + row['totalReviews'] + '_' + row['rating'])) {
            dictOfHave[row['brand'] + '_' + row['totalReviews'] + '_' + row['rating']] = "h";
            dataFiltered.push(row);
        }
    }
    return dataFiltered;
}

// 预留一个方法给popup调用
async function downloadDataBg() {
    let stringDate = new Date();
    stringDate = `${stringDate.getFullYear()}_${stringDate.getMonth()+1}_${stringDate.getDate()}_${stringDate.getHours()}_${stringDate.getMinutes()}_${stringDate.getSeconds()}`;
    let dataList = await getDataList("productsList");
    if (!dataList.length) {
        createNotify('没有执行过步骤1！请执行', '', false);
        return;
    }
    /*处理一下，删除无效数据，以及删除变体商品*/
    let datafiltered = [];
    //判断一下具体是缺失哪种类型的数据
    let miss2Array = dataList.filter((x) => {
        //找到所有total review 不是-1的，如果数量大于1，说明是有效的，否则是无效的
        return x['totalReviews'] != -1;
    });
    if (!miss2Array.length) {
        createNotify('提示:没有执行过步骤2！请按照需要执行', '', false);
        //return;
    }
    let miss3Array = dataList.filter((x) => {
        //找到所有 earliest_date 不是-1的，如果数量大于1，说明是有效的，否则是无效的
        return x['earliest_date'] != -1;
    });
    if (!miss3Array.length) {
        createNotify('提示:没有执行过步骤3！请按照需要执行', '', false);
        //return;
    }
    let miss4Array = dataList.filter((x) => {
        return x['brand'] != -1;
    });
    if (!miss4Array.length) {
        createNotify('提示:没有执行过步骤4！请按照需要执行', '', false);
        //return;
    }
    let miss5Array = dataList.filter((x) => {
        return x['current'] != -1;
    });
    if (!miss5Array.length) {
        createNotify('提示:没有执行过步骤5！请按照需要执行', '', false);
        // return;
    }
    /*筛选条件，每一行数据中，不能出现-1，评论数不能为0，价格不为0*/
    for (let row of dataList) {
        let haveMinus1 = false;
        for (let col in row) {
            if (row[col] === -1) {
                haveMinus1 = true;
            }
        }
        if (row['totalReviews'] === -1 || row['price'] === 0)
            continue;
        if (!haveMinus1)
            datafiltered.push(row);
    }
    datafiltered = drop_variant(datafiltered);
    // Add estimate_year
    datafiltered.map((x) => {
        //一定有值
        let earliest_year = parseInt(x["earliest_date"].replace(/.*(\d{4}).*/, "$1"));
        //可能有值
        if (x["upDate"].toLowerCase().indexOf("na") == -1) { //说明是有效值，不含有NA
            let upDateYear = parseInt(x["upDate"].replace(/.*(\d{4}).*/, "$1"));
            x["estimate_year"] = upDateYear > earliest_year ? earliest_year : upDateYear;
        } else {
            x["estimate_year"] = earliest_year;
        }
    });
    if (datafiltered.length == 0) {
        createNotify('数据文件大小为零，确定有按照12345来获取过数据吗？', '', false);
    } else {
        if (!checkValid()) {
            createNotify('未登录账号只能下载10条数据喔！', '', false);
            if (datafiltered.length > 10)
                datafiltered.length = 10;
            downloadFile(datafiltered, `productsList-${stringDate}.csv`);
        } else {
            downloadFile(datafiltered, `productsList-${stringDate}.csv`);
        }
    }
}


// web请求监听，最后一个参数表示阻塞式，需单独声明权限：webRequestBlocking
chrome.webRequest.onBeforeRequest.addListener(details => {
    // cancel 表示取消本次请求
    if (!showImage && details.type == 'image') return {
        cancel: true
    }; //'font', 'image', 'stylesheet'
    if (!showFont && details.type == 'font') return {
        cancel: true
    };
    if (!showStyle && details.type == 'stylesheet') return {
        cancel: true
    };
}, {
    urls: ["<all_urls>"]
}, ["blocking"]);