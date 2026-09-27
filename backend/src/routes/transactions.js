const router = require("express").Router();
const { authorize } = require("../middleware/auth");
const { getBorrowed, getReturned, getMyBorrowed, getMyReturned, recordBorrow, recordReturn, recordMyReturn } = require("../controllers/transactionController");

router.get("/borrowed", authorize("admin"), getBorrowed);
router.get("/returned", authorize("admin"), getReturned);
router.get("/my-borrowed", getMyBorrowed);
router.get("/my-returned", getMyReturned);
router.post("/borrow", authorize("admin"), recordBorrow);
router.post("/return", authorize("admin"), recordReturn);
router.post("/my-return", recordMyReturn);

module.exports = router;
