const router = require("express").Router();
const { authorize } = require("../middleware/auth");
const { getBorrowed, getReturned, getMyBorrowed, getMyReturned, getStats, getMyStats, recordBorrow, recordReturn, recordMyReturn } = require("../controllers/transactionController");

router.get("/borrowed", authorize("admin"), getBorrowed);
router.get("/returned", authorize("admin"), getReturned);
router.get("/stats", authorize("admin"), getStats);
router.get("/my-borrowed", getMyBorrowed);
router.get("/my-returned", getMyReturned);
router.get("/my-stats", getMyStats);
router.post("/borrow", authorize("admin"), recordBorrow);
router.post("/return", authorize("admin"), recordReturn);
router.post("/my-return", recordMyReturn);

module.exports = router;
