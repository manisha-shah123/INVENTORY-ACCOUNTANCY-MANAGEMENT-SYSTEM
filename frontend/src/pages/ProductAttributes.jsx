import { useNavigate } from "react-router-dom";
import AttributeManager from "../components/AttributeManager";
import {
  brandService,
  categoryService,
  gradeService,
  sizeService,
  hsCodeService,
} from "../services/attributeService";

const ProductAttributes = () => {
  const navigate = useNavigate();

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Manage Product Attributes</h1>
          <p className="page-subtitle">
            Add, edit, or delete Brands, Categories, Grades, Sizes, and HS
            Codes used across products.
          </p>
        </div>
        <button
          className="btn btn-outline"
          onClick={() => navigate("/dashboard/products")}
        >
          Back to Products
        </button>
      </div>

      <div className="attribute-grid">
        <AttributeManager title="Category" service={categoryService} />
        <AttributeManager title="Brand" service={brandService} />

        <AttributeManager title="Grade" service={gradeService} />
        <AttributeManager title="Size" service={sizeService} />
        <AttributeManager title="HS Code" service={hsCodeService} />
      </div>
    </div>
  );
};

export default ProductAttributes;