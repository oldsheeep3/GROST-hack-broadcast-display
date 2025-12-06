window.onload = () => {
    main();
}

function main() {
    const queries = getUrlQueries();
    console.log("get query param",JSON.stringify(queries));
    const title = queries.title ?? "";
    const subtitle = queries.subtitle ?? "";
    const hashtag = queries.hashtag ? "#" + queries.hashtag : "";
    const xid = queries.xid ? "@" + queries.xid : "";
    const ytid = queries.ytid ?? null;
    console.log(title,subtitle,hashtag,xid);
}

function getUrlQueries() {
    var queryStr = window.location.search.slice(1);  // 文頭?を除外
    queries = {};

    // クエリがない場合は空のオブジェクトを返す
    if (!queryStr) {
        return queries;
    }

    // クエリ文字列を & で分割して処理
    queryStr.split('&').forEach(function (queryStr) {
        // = で分割してkey,valueをオブジェクトに格納
        var queryArr = queryStr.split('=');
        queries[queryArr[0]] = queryArr[1];
    });

    return queries;
}