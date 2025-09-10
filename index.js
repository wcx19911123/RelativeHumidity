const STORAGE_PREFIX = '__HeFengWeather_';
const HISTORY_DAYS = 10;
var HISTORY_RESULT = null;
var TOTAL_CHART = null;
var DAY_CHART = null;

function get(key) {
    return localStorage[STORAGE_PREFIX + key];
}

function set(key, value) {
    localStorage[STORAGE_PREFIX + key] = value;
}

function getParam(key) {
    return new URL(location.href).searchParams.get(key);
}

/**
 * 异步获取城市代码（支持本地缓存）
 * @param cityName 城市代码（拼音）
 * @param upName 上级行政区域代码（拼音）
 * @param filter 过滤器
 * @returns {Promise<string>} 城市id（可能为空）
 */
async function getCityCode(cityName, upName, filter) {
    let result = get('cityId_' + cityName);
    if (result) {
        result = JSON.parse(result);
        document.querySelector("span#city").innerHTML = result.name;
        console.log('从缓存读取城市ID，' + cityName + '：' + result);
        return result.id;
    }
    result = await fetch(`https://${getParam('h')}/geo/v2/city/lookup?key=${getParam('k1')}
&location=${cityName}
${upName ? '&adm=' + upName : ''}`)
        .then(response => response.json())
        .then(json => result = json.location?.filter(filter)?.['0']);
    result && set('cityId_' + cityName, JSON.stringify(result));
    document.querySelector("span#city").innerHTML = result.name;
    console.log('从网络获取城市ID，' + cityName + '：' + result.id);
    return result.id;
}

/**
 * 获取当前日期
 * @param add 加多少天
 * @returns {string} yyyyMMdd
 */
function getDate(add) {
    let now = new Date();
    now.setDate(now.getDate() + (add || 0));
    return '' + now.getFullYear() + ((now.getMonth() + 1) + '').padStart(2, '0') + (now.getDate() + '').padStart(2, '0');
}

/**
 * 获取某天的天气历史信息
 * @param cityId 城市ID
 * @param date 日期（yyyyMMdd）
 * @returns {Promise<string|any>}
 */
async function getHistory(cityId, date) {
    let result = get('history_' + cityId + '_' + date);
    if (result) {
        console.log('从缓存读取历史天气，' + cityId + '_' + date + '：' + result.substr(0, 100));
        return JSON.parse(result);
    }
    result = await fetch(`https://${getParam('h')}/v7/historical/weather?key=${getParam('k2')}
&location=${cityId}&date=${date}`)
        .then(response => response.json())
        .then(json => result = json?.code === '200' ? JSON.stringify(json) : null);
    result && set('history_' + cityId + '_' + date, result);
    console.log('从网络获取历史天气，' + cityId + '_' + date + '：' + result.substr(0, 100));
    return JSON.parse(result);
}

/**
 * 获取历史10天的城市天气信息
 * @param cityId
 * @returns {Promise<Array<object>>}
 */
function getHistory10Days(cityId) {
    let result = [];
    for (let i = 1; i <= HISTORY_DAYS; i++) {
        result.push(getHistory(cityId, getDate(-i)))
    }
    result = Promise.allSettled([...result]);
    return result;
}

function formatData(historyList) {
    let result = {};
    result.total = [['日期', '最小相对湿度', '平均相对湿度', '最大相对湿度']];
    result.days = {'default': [['小时', '实时相对湿度']]};
    historyList.forEach(day => {
        day.weatherHourly.forEach(hour => {
            if (!result.days[day.weatherDaily.date]) {
                result.days[day.weatherDaily.date] = result.days.default.slice(0);
            }
            result.days[day.weatherDaily.date].push([hour.time.match(/\d{2}:\d{2}/)?.['0'], +hour.humidity / 100]);
        });
        let humidityList = result.days[day.weatherDaily.date].filter(o => typeof o[1] == 'number').map(o => o[1]);
        result.total.push([
            day.weatherDaily.date,
            Math.min(...humidityList),
            +(humidityList.reduce((a, b) => a + b, 0) / humidityList.length).toFixed(2),
            Math.max(...humidityList),
        ]);
    });
    delete result.days.default;
    HISTORY_RESULT = result;
    return result;
}

function drawChart(setting) {
    let totalData = google.visualization.arrayToDataTable(setting.total);
    let totalOptions = {
        title: '最近10天相对湿度',
        // curveType: 'function',
        legend: {position: 'right'},
        vAxis: {
            title: '相对湿度', format: 'percent', minValue: 0, maxValue: 1,
            gridlines: {color: '#777', count: 5},
        },
        hAxis: {
            title: '日期', format: 'date', slantedText: true, direction: -1,
        },
        colors: ['#EB3324', '#000', '#0023F5'],
        dataOpacity: 0.6,
        pointSize: 6,
    };
    TOTAL_CHART = new google.visualization.LineChart(document.getElementById('div_history_10days'));
    TOTAL_CHART.draw(totalData, totalOptions);
    google.visualization.events.addListener(TOTAL_CHART, 'select', showDayHistory);
}

function showDayHistory() {
    let row = TOTAL_CHART.getSelection()?.['0']?.row;
    if (typeof row !== 'number') {
        return;
    }
    let date = HISTORY_RESULT?.total?.[row + 1]?.['0'];
    if (!date) {
        return;
    }
    let data = HISTORY_RESULT?.days?.[date];
    if (!data) {
        return;
    }
    let dayData = google.visualization.arrayToDataTable(data);
    let dayOptions = {
        title: date + '的相对湿度',
        // curveType: 'function',
        legend: {position: 'right'},
        vAxis: {
            title: '相对湿度', format: 'percent', minValue: 0, maxValue: 1,
            gridlines: {color: '#777', count: 5},
        },
        hAxis: {
            title: '时间', format: 'date', slantedText: true,
        },
        // colors: ['#EB3324', '#000', '#0023F5'],
        dataOpacity: 0.6,
        pointSize: 6,
    };
    document.querySelector('#div_history_1day').style.display = '';
    DAY_CHART = new google.visualization.LineChart(document.getElementById('div_history_1day'));
    DAY_CHART.draw(dayData, dayOptions);
    location.href = location.href.substring(0, location.href.lastIndexOf('#')) + "#div_history_1day";
    google.visualization.events.addListener(DAY_CHART, 'select',
        () => {
            document.querySelector('#div_history_1day').style.display = 'none';
            location.href = location.href.substring(0, location.href.lastIndexOf('#')) + "#div_history_10days";
        });
}

function start() {
    getCityCode(getParam('c'), getParam('u'), o => o.name === getParam('n'))
        .then(id => getHistory10Days(id))
        .then(params => formatData([...params].map(o => o.value?.code === '200' ? o.value : null)))
        .then(setting => drawChart(setting))
}

google.charts.load('current', {packages: ['corechart', 'line']});
google.charts.setOnLoadCallback(start);