-- Función para crear empleado con PIN hasheado
CREATE OR REPLACE FUNCTION create_employee_with_pin(
  p_name text,
  p_code text,
  p_pin text,
  p_role text DEFAULT 'cashier',
  p_store_id uuid DEFAULT NULL,
  p_register_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO employees (name, code, pin_hash, role, store_id, register_id, active)
  VALUES (
    p_name,
    p_code,
    extensions.crypt(p_pin, extensions.gen_salt('bf')),
    p_role,
    p_store_id,
    p_register_id,
    true
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Función para actualizar PIN
CREATE OR REPLACE FUNCTION update_employee_pin(
  p_id uuid,
  p_pin text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  UPDATE employees
  SET pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf'))
  WHERE id = p_id;
END;
$$;
