import express, { response } from "express";
import bodyParser from "body-parser";
import axios from "axios";
import pg from "pg";
import bcrypt from "bcrypt";
import session from "express-session";
import passport from "passport";
import { Strategy } from "passport-local";
import dotenv from "dotenv";

const app = express();
const port = 3000;
const API_KEY = "AIzaSyAE6drRLGVE69UV9FBsen3uMDv2DqBq_88";
dotenv.config();
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
  })
);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set("view engine", "ejs");

app.use(passport.initialize());
app.use(passport.session());

const db = new pg.Client({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});
db.connect();
const defaultBooks = [
  { id: "1", title: "Atomic Habits", cover: "/images/Atomic Habits.jpg" },
  {
    id: "2",
    title: "When I'm With You",
    cover: "/images/When I'm With You.jpg",
  },
  {
    id: "3",
    title: "The Almanack of Naval Ravikant",
    cover: "/images/The almanack of naval ravikant.jpg",
  },
  { id: "4", title: "treasure island", cover: "/images/treasure island.jpg" },
  {
    id: "5",
    title: "The Courage To Be Disliked",
    cover: "/images/the courage to be disliked.jpg",
  },
  {
    id: "6",
    title: "three body problem",
    cover: "/images/three body problem.jpg",
  },
];
let searchedBook = [];

app.get("/", (req, res) => {
  res.render("index.ejs");
});
app.get("/login", (req, res) => {
  res.render("login.ejs");
});
app.get("/main", async (req, res) => {
  try {
    res.render("main.ejs", { books: defaultBooks, API_KEY });
  } catch (err) {
    return res.send("error");
  }
});

app.get("/note", async (req, res) => {
  try {
    const bookId = req.query.id; // Get book ID from the URL
    console.log("bookid=", bookId);
    const email = req.body.username;
    const user_id = req.session.user_id;
    console.log("user_id=", user_id);

    const selectedBook =
      defaultBooks.find((book) => book.id === bookId) ||
      searchedBook.find((book) => book.id === bookId); // Find the matching book

    if (!selectedBook) {
      return res.send("Book not found"); // Handle case if no book matches the ID
    }

    const notes = await db.query(
      "SELECT thoughts.notes FROM thoughts WHERE user_id=$1 AND bookid=$2",
      [user_id, bookId]
    );

    const pass = notes.rows.map((row) => row.notes).join("\n");
    res.render("note", {
      books: selectedBook,
      API_KEY,
      thought: pass,
      bookid: bookId,
    }); // Pass only the selected book
  } catch (err) {
    console.log(err);
  }
});

// app.get("/buy", (req, res) => {
//   const bookId = req.query.id;
//   const selbook =
//     defaultBooks.find((book) => book.id === bookId) ||
//     searchedBook.find((book) => book.id === bookId);
//   if (!selbook) {
//     return res.send("not found");
//   } else {
//     res.render("buy.ejs", { books: selbook, API_KEY });
//   }
// });
app.get("/buy", (req, res) => {
  const bookId = req.query.id;

  // First try to find the book in defaultBooks or searchedBook
  let selbook =
    defaultBooks.find((book) => book.id === bookId) ||
    searchedBook.find((book) => book.id === bookId);

  // If not found, check if it's a cart item by querying the database
  if (!selbook) {
    db.query("SELECT * FROM cart WHERE bookid = $1", [bookId])
      .then((result) => {
        if (result.rows.length > 0) {
          // Format the cart item to match the expected book structure
          const cartBook = result.rows[0];
          selbook = {
            id: cartBook.bookid,
            title: cartBook.book_title,
            cover: cartBook.cover,
          };
          res.render("buy.ejs", { books: selbook, API_KEY });
        } else {
          res.send("Book not found");
        }
      })
      .catch((err) => {
        console.error("Database error:", err);
        res.status(500).send("Error retrieving book information");
      });
  } else {
    // If found in defaultBooks or searchedBook, render as usual
    res.render("buy.ejs", { books: selbook, API_KEY });
  }
});

app.get("/cart", async (req, res) => {
  const user_id = req.session.user_id;

  try {
    const result = await db.query("SELECT * FROM cart WHERE user_id=$1", [
      user_id,
    ]);
    res.render("cart.ejs", { tobedisplayed: result.rows });
  } catch (err) {
    console.log("error", err);
    res.status(500).send("Failed to load cart");
  }
});

app.post("/", async (req, res) => {
  const email = req.body.username;
  const password = req.body.password;
  try {
    const storedPassword = await bcrypt.hash(password, 10);

    const user = await db.query("SELECT * FROM details WHERE email=$1", [
      email,
    ]);
    if (user.rows.length > 0) {
      return res.send("USER ALREADY EXISTS");
    } else {
      const credentials = await db.query(
        "INSERT  INTO details(email,password) VALUES($1,$2) ",
        [email, storedPassword]
      );

      res.redirect("/login");
    }
  } catch (err) {
    return res.send("error");
  }
});

app.post("/main", async (req, res) => {
  const book = req.body.bookname;
  console.log("bookname", book);
  const bookid = req.query.id;
  console.log("booksid=", bookid);
  try {
    const searchedBookResponse = await axios.get(
      `https://www.googleapis.com/books/v1/volumes?q=${book}&key=${API_KEY}`,
      { timeout: 5000 }
    );
    if (
      searchedBookResponse.data.items &&
      searchedBookResponse.data.items.length > 0
    ) {
      searchedBook = searchedBookResponse.data.items.map((item) => ({
        id: item.id,
        title: item.volumeInfo.title || "Unknown Title",
        cover: item.volumeInfo.imageLinks?.thumbnail || "/images/default.jpg",
        description: item.volumeInfo.description || "NOT AVAILABLE",
      }));
      res.render("main", { books: searchedBook });
    } else {
      res.render("main", { books: defaultBooks });
    }
  } catch (err) {
    return res.send("error");
  }
});

app.post("/note", async (req, res) => {
  const book = req.query.bookname;
  const user_id = req.session.user_id;
  const bookId = req.body.bookid;
  const writtenNote = req.body.thought;

  console.log("received book id=", bookId);
  console.log("received thoguht =", writtenNote);

  const searchedBookResponse = await axios.get(
    `https://www.googleapis.com/books/v1/volumes?q=${book}&key=${API_KEY}`,
    { timeout: 5000 }
  );

  try {
    const oldnote = await db.query(
      "SELECT * FROM thoughts WHERE user_id=$1 AND bookid=$2",
      [user_id, bookId]
    );
    console.log("old note=", oldnote.rows);
    const selectedBook =
      defaultBooks.find((book) => book.id === bookId) ||
      searchedBook.find((book) => book.id === bookId);

    if (oldnote.rows.length > 0) {
      await db.query(
        "UPDATE  thoughts SET notes=$1 WHERE user_id=$2 AND bookid=$3",
        [writtenNote, user_id, bookId]
      );
    } else {
      console.log("cover=", searchedBook.cover);
      console.log(writtenNote);
      await db.query(
        "INSERT INTO thoughts(user_id,notes,bookid)VALUES($1,$2,$3)",
        [user_id, writtenNote, bookId]
      );
    }
    /*  if (
      searchedBookResponse.data.items &&
      searchedBookResponse.data.items.length > 0

    ) {
      const selectedBook =
        defaultBooks.find((book) => book.id === bookId) ||
        searchedBook.find((book) => book.id === bookId);

      searchedBook = searchedBookResponse.data.items.map((item) => ({
        id: item.id,
        title: item.volumeInfo.title || "Unknown Title",
        cover: item.volumeInfo.imageLinks?.thumbnail || "/images/default.jpg",
        description: item.volumeInfo.description || "Not available",
      }));
      */

    const notes = await db.query(
      "SELECT thoughts.notes FROM thoughts WHERE user_id=$1 AND bookid=$2",
      [user_id, bookId]
    );

    const pass = notes.rows.map((row) => row.notes).join("\n");
    res.render("note", {
      books: selectedBook,
      API_KEY,
      thought: pass,
      bookId: bookId,
    });
  } catch (err) {
    console.log(err);
    return res.send("book not available");
  }
});
/*app.post(
  "/login",
  passport.authenticate("local", {
    successRedirect: "/main",
    failureRedirect: "/index",
  })
);*/

app.post("/login", (req, res, next) => {
  passport.authenticate("local", (err, user) => {
    if (err) return next(err);
    if (!user) return res.redirect("/login");
    req.login(user, (err) => {
      if (err) return next(err);
      req.session.user_id = user.user_id;
      return res.redirect("/main");
    });
  })(req, res, next);
});

app.post("/cart", async (req, res) => {
  const user_id = req.session.user_id;
  const bookId = req.body.bookid;
  const matchedbook =
    defaultBooks.find((book) => book.id === bookId) ||
    searchedBook.find((book) => book.id === bookId);

  const booktitle = matchedbook ? matchedbook.title : null;
  const cover = matchedbook ? matchedbook.cover : null;

  console.log("bookId=", bookId);
  console.log("booktitle=", booktitle);
  console.log("matchedbook", matchedbook);
  console.log("req body=", req.body);
  console.log("cover=", cover);

  try {
    const cart = await db.query(
      "INSERT INTO cart(user_id,bookid,book_title,cover) VALUES($1,$2,$3,$4)",
      [user_id, bookId, booktitle, cover]
    );

    const updatedCart = await db.query(
      "SELECT * FROM cart WHERE user_id = $1",
      [user_id]
    );
    // res.render("back", {
    //   tobedisplayed: updatedCart.rows,
    // });
    return res.redirect("back");
  } catch (err) {
    console.log("error", err);
  }
});

app.post("/removeitems", async (req, res) => {
  try {
    const user_id = req.session.user_id;
    const bookId = req.body.bookid;
    await db.query("DELETE FROM cart WHERE user_id=$1 AND bookid=$2", [
      user_id,
      bookId,
    ]);
    console.log("working");

    return res.redirect("/cart");
  } catch (err) {
    console.log("error=", err);
  }
});

passport.use(
  new Strategy(async function verify(username, password, cb) {
    try {
      const result = await db.query("SELECT * FROM details WHERE email=$1", [
        username,
      ]);
      if (result.rows.length === 0) {
        return res.send("User does not exist");
      } else {
        const user = result.rows[0];
        const storedPassword = user.password;
        bcrypt.compare(password, storedPassword, (err, valid) => {
          if (err) {
            console.log("Error logging in", err);
            return cb(err);
          } else {
            if (valid) {
              return cb(null, user);
            } else {
              return cb(null, false);
            }
          }
        });
      }
    } catch (err) {
      console.log("error", err);
    }
  })
);
passport.serializeUser((user, cb) => {
  cb(null, user.user_id);
});
passport.deserializeUser((id, cb) => {
  db.query("SELECT * FROM details WHERE user_id = $1", [id], (err, result) => {
    if (err) {
      return cb(err);
    }
    cb(null, result.rows[0]);
  });
});

app.listen(port, () => {
  console.log(`Server running on port: ${port}`);
});
