$content = Get-Content "c:\Users\Lenovo\Documents\Stage 2\backend\server.js" -Raw
$content = $content -replace "const \{ name, email, password, role \} = req\.body;", "const { name, email, password, role, city, phone, address } = req.body;"
$content = $content -replace "INSERT INTO users \(name, email, password_hash, role\)", "INSERT INTO users (name, email, password_hash, role, city, phone, address)"
$content = $content -replace "VALUES \(\$1, \$2, \$3, \$4\)", "VALUES ($1, $2, $3, $4, $5, $6, $7)"
$content = $content -replace "\[name, email, hashedPassword, role\]", "[name, email, hashedPassword, role, city || null, phone || null, address || null]"
$content = $content -replace "RETURNING \*", "RETURNING id, name, email, role, city, phone, address, avatar"
$content = $content -replace "res\.json\(result\.rows\[0\]\);", "const user = result.rows[0]; const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' }); res.json({ token, user });"
Set-Content "c:\Users\Lenovo\Documents\Stage 2\backend\server.js" -Value $content
