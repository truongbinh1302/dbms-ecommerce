# MongoDB Backup and Recovery Demo

Run these commands from a terminal where `mongodump`, `mongorestore`, and `mongosh` are available.

```bash
# 1. Full logical backup
mongodump --db ecommerce_mongo --out ./backup_mongo

# 2. Simulate accidental deletion
mongosh ecommerce_mongo --eval "db.products.deleteMany({ productId: { \$lte: 3 } }); printjson(db.products.countDocuments())"

# 3. Restore the backup
mongorestore --db ecommerce_mongo --drop ./backup_mongo/ecommerce_mongo

# 4. Verify restored documents
mongosh ecommerce_mongo --eval "printjson(db.products.find({ productId: { \$lte: 3 } }, { productId: 1, name: 1, stock: 1 }).toArray())"
```

Expected evidence for the report:

1. Screenshot of `mongodump` finishing successfully.
2. Screenshot showing product documents were deleted.
3. Screenshot of `mongorestore --drop` finishing successfully.
4. Screenshot showing the deleted documents exist again after restore.
