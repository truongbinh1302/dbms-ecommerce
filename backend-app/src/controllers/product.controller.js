const productService = require('../services/product.service');
const { success, error } = require('../utils/response');

const getProducts = async (req, res) => {
    try {
        const result = await productService.getProducts(req.query);
        return success(res, result, 'Products retrieved successfully');
    } catch (err) {
        return error(res, err.message);
    }
};

const getProductSuggestions = async (req, res) => {
    try {
        const { q } = req.query;
        const result = await productService.getProductSuggestions(q);
        return success(res, result, 'Suggestions retrieved successfully');
    } catch (err) {
        return error(res, err.message);
    }
};

const getProductById = async (req, res) => {
    try {
        const { id } = req.params;
        const product = await productService.getProductById(id);

        if (!product) {
            return error(res, 'Product not found', 404);
        }

        return success(res, product, 'Product retrieved successfully');
    } catch (err) {
        return error(res, err.message);
    }
};

const createProduct = async (req, res) => {
    try {
        const result = await productService.createProduct(req.body, req.user.id);
        return success(res, result, 'Product created successfully', 201);
    } catch (err) {
        return error(res, err.message);
    }
};

const updateProduct = async (req, res) => {
    try {
        const { id } = req.params;
        await productService.updateProduct(id, req.body, req.user.id);
        return success(res, { productId: id }, 'Product updated successfully');
    } catch (err) {
        return error(res, err.message);
    }
};

const deleteProduct = async (req, res) => {
    try {
        const { id } = req.params;
        await productService.deleteProduct(id, req.user.id);
        return success(res, { productId: id }, 'Product deleted successfully');
    } catch (err) {
        return error(res, err.message);
    }
};

const updateStock = async (req, res) => {
    try {
        const { id } = req.params;
        const { stock, reason } = req.body;
        const result = await productService.updateStock(id, stock, reason, req.user.id);
        return success(res, result, 'Stock updated successfully');
    } catch (err) {
        return error(res, err.message);
    }
};

const uploadProductImage = async (req, res) => {
    try {
        if (!req.file) {
            return error(res, 'No file uploaded', 400);
        }

        const imageUrl = `/uploads/${req.file.filename}`;
        return success(res, { imageUrl, filename: req.file.filename }, 'Image uploaded successfully', 201);
    } catch (err) {
        return error(res, err.message);
    }
};

module.exports = {
    getProducts,
    getProductSuggestions,
    getProductById,
    createProduct,
    updateProduct,
    deleteProduct,
    updateStock,
    uploadProductImage
};