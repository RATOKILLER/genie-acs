import React, { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { hasPermission } from "./permissions";
import "./NavBar.css";

function NavBar() {
  const navigate = useNavigate();
  const isAdmin = hasPermission("admin");
  const [showConfirm, setShowConfirm] = useState(false);
  const confirmRef = useRef(null);

  const handleLogoutClick = () => {
    setShowConfirm(true);
  };

  const handleConfirmLogout = () => {
    localStorage.removeItem("user");
    navigate("/login");
  };

  const handleCancelLogout = () => {
    setShowConfirm(false);
  };

  useEffect(() => {
    const onClickOutside = (e) => {
      if (confirmRef.current && !confirmRef.current.contains(e.target)) {
        setShowConfirm(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <nav className="navbar">
      <h2 className="navbar-logo">TopNet ACS</h2>
      <ul className="navbar-links">
        <li>
          <Link to="/devices">CPE Dashboard</Link>
        </li>
         <li>
         <Link to="/tech">Dashboard Técnico</Link>
       </li>
        {isAdmin && (
          <li>
            <Link to="/admin">Admin ACS</Link>
          </li>
        )}
        <li className="logout-item">
          <button className="logout-button" onClick={handleLogoutClick}>
            Logout
          </button>
          {showConfirm && (
            <div className="logout-confirmation" ref={confirmRef}>
              <p>Deseja realmente fazer logout?</p>
              <button className="btn-yes" onClick={handleConfirmLogout}>
                Sim
              </button>
              <button className="btn-no" onClick={handleCancelLogout}>
                Não
              </button>
            </div>
          )}
        </li>
      </ul>
    </nav>
  );
}

export default NavBar;
