const http = require("http");
const { HOST, PORT, createRequestHandler } = require("./server/app");

const server = http.createServer(createRequestHandler());

server.listen(PORT, HOST, () => {
  console.log(`MazeBench running at http://${HOST}:${PORT}`);
});
