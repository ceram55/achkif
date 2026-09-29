from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from rest_framework.test import APIClient

from .models import (
    Category,
    Customer,
    Product,
    ProjectCalculation,
    InventorySettings,
    Sale,
    SaleItem,
    Section,
    Stock,
    StockMovement,
    Supplier,
    UserProfile,
    Warehouse,
)


class InventoryWorkflowTests(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.user = user_model.objects.create_user(username="owner", password="strong-test-password")
        UserProfile.objects.create(user=self.user, role="owner")
        self.category, _ = Category.objects.get_or_create(name="Zellij")
        self.section, _ = Section.objects.get_or_create(name="Wall")
        self.supplier = Supplier.objects.create(name="Ceramic supplier")
        self.customer = Customer.objects.create(name="Customer")
        self.warehouse, _ = Warehouse.objects.get_or_create(name="Shop")
        self.product = Product.objects.create(
            reference="ZL-2045",
            name="Green zellij",
            category=self.category,
            section=self.section,
            m2_per_carton=Decimal("1.200"),
            purchase_price=Decimal("64.00"),
            selling_price_carton=Decimal("85.00"),
            selling_price_m2=Decimal("70.83"),
            supplier=self.supplier,
            minimum_stock=Decimal("10"),
        )
        Stock.objects.create(product=self.product, warehouse=self.warehouse, cartons=Decimal("35"))
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_total_area_is_derived_from_cartons(self):
        self.assertEqual(self.product.total_cartons, Decimal("35"))
        self.assertEqual(self.product.total_m2, Decimal("42.000"))

    def test_updating_area_per_carton_recalculates_total_area(self):
        response = self.client.patch(
            f"/api/products/{self.product.pk}/",
            {"m2_per_carton": "1.500"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.product.refresh_from_db()
        self.assertEqual(self.product.total_cartons, Decimal("35"))
        self.assertEqual(self.product.total_m2, Decimal("52.500"))

    def test_dashboard_requires_authentication(self):
        client = APIClient()
        response = client.get("/api/dashboard/")
        self.assertEqual(response.status_code, 403)

    def test_employee_product_list_hides_purchase_cost_without_profile(self):
        employee = get_user_model().objects.create_user(username="employee", password="employee-password")
        self.client.force_authenticate(employee)
        response = self.client.get("/api/products/")
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("purchase_price", response.data[0])

    def test_login_requires_csrf_token(self):
        client = Client(enforce_csrf_checks=True)
        response = client.post("/api/auth/login/", {"username": "owner", "password": "strong-test-password"})
        self.assertEqual(response.status_code, 403)
        client.get("/api/auth/csrf/")
        response = client.post(
            "/api/auth/login/",
            {"username": "owner", "password": "strong-test-password"},
            HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value,
        )
        self.assertEqual(response.status_code, 200)

    def test_login_accepts_local_vite_origin_with_csrf(self):
        client = Client(enforce_csrf_checks=True)
        client.get("/api/auth/csrf/", HTTP_HOST="127.0.0.1")
        response = client.post(
            "/api/auth/login/",
            {"username": "owner", "password": "strong-test-password"},
            HTTP_HOST="127.0.0.1",
            HTTP_ORIGIN="http://127.0.0.1:5173",
            HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value,
        )
        self.assertEqual(response.status_code, 200, response.content)

    def test_sale_reduces_stock_and_creates_movement(self):
        response = self.client.post("/api/sales/", {
            "customer": self.customer.pk,
            "paid": "200",
            "items": [{"product": self.product.pk, "warehouse": self.warehouse.pk, "unit": "carton", "quantity": "8"}],
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.product.refresh_from_db()
        self.assertEqual(self.product.total_cartons, Decimal("27"))
        movement = StockMovement.objects.get(movement_type="sale")
        self.assertEqual((movement.previous_stock, movement.new_stock), (Decimal("35"), Decimal("27")))

    def test_oversell_does_not_create_sale_or_change_stock(self):
        response = self.client.post("/api/sales/", {
            "items": [{"product": self.product.pk, "warehouse": self.warehouse.pk, "unit": "carton", "quantity": "36"}],
        }, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Sale.objects.count(), 0)
        self.assertEqual(StockMovement.objects.count(), 0)
        self.product.refresh_from_db()
        self.assertEqual(self.product.total_cartons, Decimal("35"))

    def test_purchase_receipt_increases_stock_and_records_movement(self):
        response = self.client.post(f"/api/purchases/", {
            "supplier": self.supplier.pk,
            "invoice_reference": "INV-2",
            "items": [{"product": self.product.pk, "warehouse": self.warehouse.pk, "cartons": "20", "purchase_price": "60"}],
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.product.refresh_from_db()
        self.assertEqual(self.product.total_cartons, Decimal("55"))
        self.assertEqual(StockMovement.objects.filter(movement_type="purchase").count(), 1)

    def test_project_calculator_rounds_up_and_saves_calculation(self):
        response = self.client.post("/api/calculator/", {
            "product": self.product.pk,
            "wall_area": "27",
            "floor_area": "0",
            "waste_percent": "10",
        }, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["cartons_required"], Decimal("25"))
        self.assertEqual(response.data["area_with_waste"], Decimal("29.70"))
        self.assertTrue(response.data["sufficient"])
        self.assertEqual(ProjectCalculation.objects.count(), 1)

    def test_employee_can_read_but_not_change_inventory_settings(self):
        employee = get_user_model().objects.create_user(username="settings-employee", password="employee-password")
        self.client.force_authenticate(employee)
        response = self.client.get("/api/settings/inventory/")
        self.assertEqual(response.status_code, 200)
        response = self.client.patch("/api/settings/inventory/", {"stock_control_enabled": False}, format="json")
        self.assertEqual(response.status_code, 403)
        self.assertTrue(InventorySettings.objects.get().stock_control_enabled)

    def test_m2_sale_reserves_whole_cartons_when_enabled(self):
        response = self.client.post("/api/sales/", {
            "items": [{"product": self.product.pk, "warehouse": self.warehouse.pk, "unit": "m2", "quantity": "5"}],
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        sale_item = SaleItem.objects.get(sale_id=response.data["id"])
        self.assertEqual(sale_item.quantity_cartons, Decimal("5"))
        self.assertEqual(sale_item.quantity, Decimal("6.000"))
        self.product.refresh_from_db()
        self.assertEqual(self.product.total_cartons, Decimal("30"))

    def test_customer_payment_reduces_outstanding_invoice_balance(self):
        sale_response = self.client.post("/api/sales/", {
            "customer": self.customer.pk,
            "items": [{"product": self.product.pk, "warehouse": self.warehouse.pk, "unit": "carton", "quantity": "1"}],
        }, format="json")
        self.assertEqual(sale_response.status_code, 201, sale_response.data)
        response = self.client.post("/api/payments/receive/", {"customer": self.customer.pk, "amount": "25"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        sale = Sale.objects.get(pk=sale_response.data["id"])
        self.assertEqual(sale.paid, Decimal("25"))
        self.assertEqual(sale.remaining, Decimal("60"))
        self.assertEqual(response.data["amount_paid"], Decimal("25"))
        self.assertEqual(response.data["amount_remaining"], Decimal("60"))

    def test_sale_accepts_multiple_products(self):
        second_product = Product.objects.create(
            reference="ZL-2046",
            name="Blue zellij",
            category=self.category,
            section=self.section,
            m2_per_carton=Decimal("1.200"),
            purchase_price=Decimal("50.00"),
            selling_price_carton=Decimal("75.00"),
            selling_price_m2=Decimal("62.50"),
            supplier=self.supplier,
        )
        Stock.objects.create(product=second_product, warehouse=self.warehouse, cartons=Decimal("12"))
        response = self.client.post("/api/sales/", {
            "items": [
                {"product": self.product.pk, "warehouse": self.warehouse.pk, "unit": "carton", "quantity": "2"},
                {"product": second_product.pk, "warehouse": self.warehouse.pk, "unit": "carton", "quantity": "3"},
            ],
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(SaleItem.objects.filter(sale_id=response.data["id"]).count(), 2)
        self.assertEqual(self.product.total_cartons, Decimal("33"))
        self.assertEqual(second_product.total_cartons, Decimal("9"))

    def test_purchase_accepts_multiple_products(self):
        second_product = Product.objects.create(
            reference="ZL-2047",
            name="Blue zellij",
            category=self.category,
            section=self.section,
            m2_per_carton=Decimal("1.200"),
            purchase_price=Decimal("50.00"),
            selling_price_carton=Decimal("75.00"),
            selling_price_m2=Decimal("62.50"),
            supplier=self.supplier,
        )
        response = self.client.post("/api/purchases/", {
            "supplier": self.supplier.pk,
            "items": [
                {"product": self.product.pk, "warehouse": self.warehouse.pk, "cartons": "2", "purchase_price": "60"},
                {"product": second_product.pk, "warehouse": self.warehouse.pk, "cartons": "3", "purchase_price": "50"},
            ],
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(self.product.total_cartons, Decimal("37"))
        self.assertEqual(second_product.total_cartons, Decimal("3"))